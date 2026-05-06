import type { Page } from '@playwright/test';

export interface NetworkMockOptions {
  uid?: string;
  email?: string;
  initialEmailVerified?: boolean;
}

export const FAKE_JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJtb2NrLXVpZC1lMmUiLCJlbWFpbCI6InRlc3RAdGVzdC5jb20iLCJpYXQiOjE3MDAwMDAwMDAsImV4cCI6MjcwMDAwMDAwMH0.fakesignature';

export async function setupNetworkMocks(
  page: Page,
  options: NetworkMockOptions = {},
): Promise<void> {
  const uid = options.uid ?? 'mock-uid-e2e';
  const email = options.email ?? 'test@e2e.test';
  let hasSignedUp = options.initialEmailVerified ?? false;

  await page.route(
    (url) =>
      !url.hostname.includes('localhost') &&
      !url.hostname.includes('127.0.0.1'),
    async (route) => {
      const url = route.request().url();

      if (url.includes('identitytoolkit.googleapis.com')) {
        if (url.includes('accounts:signUp')) {
          hasSignedUp = true;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              kind: 'identitytoolkit#SignupNewUserResponse',
              idToken: FAKE_JWT,
              email,
              refreshToken: 'mock-refresh',
              expiresIn: '3600',
              localId: uid,
            }),
          });
        }
        if (url.includes('accounts:createAuthUri')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              kind: 'identitytoolkit#CreateAuthUriResponse',
              registered: false,
              allProviders: ['password'],
            }),
          });
        }
        if (
          url.includes('accounts:lookup') ||
          url.includes('getAccountInfo')
        ) {
          if (!hasSignedUp) {
            return route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({
                error: {
                  code: 400,
                  message: 'USER_NOT_FOUND',
                  errors: [],
                },
              }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              kind: 'identitytoolkit#GetAccountInfoResponse',
              users: [
                {
                  localId: uid,
                  email,
                  emailVerified: false,
                  providerUserInfo: [
                    {
                      providerId: 'password',
                      federatedId: email,
                      email,
                    },
                  ],
                },
              ],
            }),
          });
        }
        if (url.includes('accounts:update')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              kind: 'identitytoolkit#SetAccountInfoResponse',
              localId: uid,
              email,
              emailVerified: true,
            }),
          });
        }
        if (url.includes('accounts:delete')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: '{}',
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{}',
        });
      }

      if (url.includes('securetoken.googleapis.com')) {
        if (!hasSignedUp) {
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({
              error: 'invalid_grant',
              error_description: 'Token has been expired or revoked.',
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            access_token: 'mock-access',
            token_type: 'Bearer',
            expires_in: 3600,
            id_token: FAKE_JWT,
            refresh_token: 'mock-refresh',
            user_id: uid,
            project_id: 'medjira-service',
          }),
        });
      }

      if (url.includes('cloudfunctions.net')) {
        if (url.includes('sendVerificationCode')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ result: { success: true } }),
          });
        }
        if (url.includes('verifyCode')) {
          const body = route.request().postDataJSON();
          const code = body?.data?.code;
          if (code === '123456') {
            return route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({ result: { success: true } }),
            });
          }
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              result: {
                success: false,
                error: 'Code incorrect.',
                attemptsLeft: 2,
              },
            }),
          });
        }
        if (url.includes('createDriverProfile')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ result: { success: true } }),
          });
        }
        if (url.includes('encryptSensitiveData')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              result: {
                encrypted: {
                  ciphertext: 'mock',
                  iv: 'mock',
                  salt: 'mock',
                  tag: 'mock',
                },
              },
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{"result":{}}',
        });
      }

      if (url.includes('firestore.googleapis.com')) {
        const method = route.request().method();
        if (method === 'POST' && url.includes(':commit')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              commitTime: new Date().toISOString(),
              writeResults: [{ updateTime: new Date().toISOString() }],
            }),
          });
        }
        if (method === 'POST' && url.includes(':batchGet')) {
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([]),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: '{}',
        });
      }

      if (url.includes('firebasestorage.googleapis.com')) {
        if (route.request().method() === 'POST') {
          const reqUrl = new URL(url);
          const name =
            reqUrl.searchParams.get('name') ||
            `drivers/${uid}/test/file.webp`;
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              name,
              bucket: 'medjira-service.firebasestorage.app',
              downloadTokens: 'mock-token-123',
            }),
          });
        }
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            name: `drivers/${uid}/test/file.webp`,
            bucket: 'medjira-service.firebasestorage.app',
            downloadTokens: 'mock-token-123',
            generation: '1',
            metageneration: '1',
            contentType: 'image/webp',
            timeCreated: new Date().toISOString(),
            updated: new Date().toISOString(),
            storageClass: 'STANDARD',
            size: '100',
            md5Hash: 'dGVzdA==',
            crc32c: '7g1YAg==',
            etag: 'CAE=',
          }),
        });
      }

      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '{}',
      });
    },
  );
}

export function setupLocalhostMocks(page: Page): void {
  page.route('**/api/stripe/connect/**', async (route) => {
    if (route.request().url().includes('/onboard')) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: null }),
      });
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ accountId: 'mock-stripe-account' }),
    });
  });
}
