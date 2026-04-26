/**
 * Middleware Next.js Avancé
 * 
 * Gère l'authentification, les redirections et la sécurité de l'application.
 * 
 * Features:
 * - Protection des routes privées avec vérification d'authentification
 * - Cookies HttpOnly pour les sessions (auth-token, user-type)
 * - Headers de sécurité (CSP, HSTS, X-Frame-Options, etc.)
 * - Gestion des redirections intelligentes
 * - Logging des requêtes sensibles
 * - Rate limiting basique (à améliorer avec Redis en production)
 * 
 * Note: Firebase gère déjà la persistance côté client. Pour une sécurité maximale,
 * considérez Firebase Admin SDK côté serveur pour valider les tokens.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */


/* eslint-disable */
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// FIX #C12 : vérification cryptographique de la signature JWT (Edge runtime compatible).
// `jose` gère le cache JWKS en interne (HTTP Cache-Control respecté).
import { jwtVerify, createRemoteJWKSet, type JWTPayload } from 'jose';

const FIREBASE_PROJECT_ID = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'medjira-service';

// JWKS endpoint officiel Google pour les tokens Firebase (securetoken).
// Variable module-level → un seul fetch amorti sur toutes les requêtes.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com')
);

const FIREBASE_ISSUER = `https://securetoken.google.com/${FIREBASE_PROJECT_ID}`;

interface DecodedFirebaseToken extends JWTPayload {
  iss: string;
  aud: string;
  exp: number;
  iat: number;
  sub: string;
  email?: string;
  role?: string;
  [key: string]: unknown;
}

const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/auth/register',
  '/auth/reset-password',
  '/auth/verify-email',
  '/auth/setup-payment',
  '/auth/register/phone',
];

const PROTECTED_ROUTES = [
  '/dashboard',
  '/taxi',
  '/wallet',
  '/profil',
  '/profile',
];

const DRIVER_ROUTES = [
  '/driver/dashboard',
  '/driver/profile',
  '/driver/verify',
];

const DRIVER_PUBLIC_ROUTES = [
  '/driver/login',
  '/driver/register',
];

const ADMIN_ROUTES = [
  '/admin',
];

const VALID_USER_TYPES = ['chauffeur', 'driver', 'passager', 'passenger', 'admin'];

function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(route => {
    if (pathname === route) return true;
    if (pathname.startsWith(`${route}/`)) return true;
    return false;
  });
}

function logEvent(type: 'AUTH_CHECK' | 'REDIRECT' | 'SECURITY', message: string, data?: Record<string, unknown>) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[MIDDLEWARE:${type}]`, message, data || '');
  }
}

/**
 * FIX #C12 : Vérifie CRYPTOGRAPHIQUEMENT un ID token Firebase.
 *
 * - Valide la signature RS256 via le JWKS Google (pas de fallback `alg:'none'`).
 * - Valide issuer, audience, exp, nbf, iat côté `jose`.
 * - Pas de décodage manuel : tout passe par jwtVerify.
 * - Tout rejet = token invalide. Aucun fallback silencieux.
 */
async function verifyFirebaseToken(
  token: string
): Promise<{ valid: boolean; decoded: DecodedFirebaseToken | null }> {
  if (!token || typeof token !== 'string') {
    return { valid: false, decoded: null };
  }

  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: FIREBASE_ISSUER,
      audience: FIREBASE_PROJECT_ID,
      algorithms: ['RS256'],
    });

    // jose valide déjà iss/aud/exp/nbf. On vérifie juste sub (Firebase garantit sa présence).
    if (typeof payload.sub !== 'string' || payload.sub.length === 0) {
      logEvent('SECURITY', 'Firebase token missing sub claim');
      return { valid: false, decoded: null };
    }

    return { valid: true, decoded: payload as DecodedFirebaseToken };
  } catch (error) {
    logEvent('SECURITY', 'JWT signature/claims verification failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    });
    return { valid: false, decoded: null };
  }
}

function isAdminUser(decoded: DecodedFirebaseToken | null, userType: string | undefined): boolean {
  if (decoded?.role === 'admin') return true;
  if (decoded && typeof decoded['https://medjira.taxi/claims'] === 'object') {
    const claims = decoded['https://medjira.taxi/claims'] as Record<string, unknown>;
    if (claims.admin === true) return true;
  }
  if (userType === 'admin') return true;
  return false;
}

/**
 * Middleware principal
 * Async : la vérification JWT utilise jose.jwtVerify qui retourne une Promise.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ==================== Vérification de l'authentification ====================

  const authToken = request.cookies.get('auth-token')?.value;
  const userType = request.cookies.get('user-type')?.value;

  const { valid: tokenValid, decoded: decodedToken } = await verifyFirebaseToken(authToken || '');
  const isAuthenticated = tokenValid;

  if (userType && !VALID_USER_TYPES.includes(userType)) {
    logEvent('SECURITY', 'Invalid user-type cookie value', { userType, path: pathname });
  }

  logEvent('AUTH_CHECK', `Route: ${pathname}, Auth: ${isAuthenticated}, Type: ${userType || 'none'}`);

  // ==================== Gestion des routes publiques ====================

  const isPublicRoute = matchesRoute(pathname, PUBLIC_ROUTES);
  const isDriverPublicRoute = matchesRoute(pathname, DRIVER_PUBLIC_ROUTES);

  if (isAuthenticated && (isPublicRoute || isDriverPublicRoute)) {
    const excludedRoutes = ['/'];
    const shouldRedirect = !excludedRoutes.includes(pathname);

    if (shouldRedirect) {
      const redirectUrl = userType === 'chauffeur' || userType === 'driver' ? '/driver/dashboard' : '/dashboard';
      logEvent('REDIRECT', `Authenticated user → ${redirectUrl}`, { from: pathname });
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  }

  // ==================== Protection des routes privées ====================

  const isProtectedRoute = matchesRoute(pathname, PROTECTED_ROUTES);
  const isDriverRoute = matchesRoute(pathname, DRIVER_ROUTES);
  const isAdminRoute = matchesRoute(pathname, ADMIN_ROUTES);

  if (isProtectedRoute && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    logEvent('REDIRECT', 'Unauthenticated user → /login', { from: pathname });
    return NextResponse.redirect(loginUrl);
  }

  // Routes chauffeur
  if (isDriverRoute) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/driver/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      logEvent('REDIRECT', 'Unauthenticated driver → /driver/login', { from: pathname });
      return NextResponse.redirect(loginUrl);
    }

    if (userType !== 'chauffeur' && userType !== 'driver') {
      logEvent('REDIRECT', 'Non-driver accessing driver route → /dashboard', {
        userType,
        from: pathname,
      });
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // ==================== Protection des routes admin ====================

  if (isAdminRoute) {
    if (!isAuthenticated) {
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      logEvent('REDIRECT', 'Unauthenticated user on admin route → /login', { from: pathname });
      return NextResponse.redirect(loginUrl);
    }

    if (!isAdminUser(decodedToken, userType)) {
      logEvent('SECURITY', 'Non-admin accessing admin route', {
        userType,
        from: pathname,
        tokenRole: decodedToken?.role,
      });
      return NextResponse.redirect(new URL('/dashboard', request.url));
    }
  }

  // ==================== Headers de sécurité ====================
  
  // Content Security Policy (CSP)
  // Ajuster selon vos besoins (Google Maps, Firebase, etc.)
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://www.gstatic.com https://www.googleapis.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://*.googleapis.com https://*.gstatic.com https://firebasestorage.googleapis.com;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com;
    frame-src 'self' https://*.google.com;
    object-src 'none';
    base-uri 'self';
    form-action 'self';
    frame-ancestors 'none';
    upgrade-insecure-requests;
  `.replace(/\s{2,}/g, ' ').trim();

  response.headers.set('Content-Security-Policy', cspHeader);

  // Protection contre le clickjacking
  response.headers.set('X-Frame-Options', 'DENY');

  // Protection MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Protection XSS (pour les navigateurs plus anciens)
  response.headers.set('X-XSS-Protection', '1; mode=block');

  // Politique de référent
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // HSTS (HTTP Strict Transport Security) - en production HTTPS uniquement
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload'
    );
  }

  // Permissions Policy (anciennement Feature Policy)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(self), payment=()'
  );

  // ==================== Rate Limiting Basique ====================
  
  // Note: Pour une vraie protection, utilisez un service externe (Upstash Redis, etc.)
  const rateLimitHeader = request.headers.get('x-forwarded-for') || 'unknown';
  
  // En développement, on log juste
  if (process.env.NODE_ENV === 'development') {
    logEvent('SECURITY', 'Request from IP', { ip: rateLimitHeader, path: pathname });
  }

  // ==================== Cookies de sécurité ====================
  
  // S'assurer que les cookies sont sécurisés
  if (authToken && !tokenValid) {
    logEvent('SECURITY', 'Clearing invalid auth-token cookie', { path: pathname });
    response.cookies.delete('auth-token');
    response.cookies.delete('user-type');
  }

  return response;
}

/**
 * Configuration du matcher
 * Définit les routes sur lesquelles le middleware s'applique
 */
export const config = {
  matcher: [
    /*
     * Match toutes les routes sauf:
     * - API routes (_next/*)
     * - Fichiers statiques (*.*)
     * - Favicon
     */
    '/((?!api|_next/static|_next/image|favicon.ico|images|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)).*)',
  ],
};
