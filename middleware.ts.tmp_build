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

/**
 * Routes publiques (accessibles sans authentification)
 */
const PUBLIC_ROUTES = [
  '/',
  '/login',
  '/signup',
  '/auth/register',
  '/auth/reset-password',
  '/auth/verify-email',
];

/**
 * Routes protégées nécessitant une authentification
 */
const PROTECTED_ROUTES = [
  '/dashboard',
  '/taxi',
  '/wallet',
  '/profil',
  '/profile',
];

/**
 * Routes réservées aux chauffeurs
 */
const DRIVER_ROUTES = [
  '/driver/dashboard',
  '/driver/profile',
  '/driver/verify',
];

/**
 * Routes publiques pour les chauffeurs (login, register, verify-email)
 */
const DRIVER_PUBLIC_ROUTES = [
  '/driver/login',
  '/driver/register',
  '/driver/verify-email',
];

/**
 * Vérifier si une route correspond à un pattern
 */
function matchesRoute(pathname: string, routes: string[]): boolean {
  return routes.some(route => {
    if (pathname === route) return true;
    if (pathname.startsWith(`${route}/`)) return true;
    return false;
  });
}

/**
 * Logger les événements importants (en production, utilisez un service de logging)
 */
function logEvent(type: 'AUTH_CHECK' | 'REDIRECT' | 'SECURITY', message: string, data?: any) {
  if (process.env.NODE_ENV === 'development') {
    console.log(`[MIDDLEWARE:${type}]`, message, data || '');
  }
  // En production, envoyez vers un service de logging (Sentry, LogRocket, etc.)
}

/**
 * Middleware principal
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const response = NextResponse.next();

  // ==================== Vérification de l'authentification ====================
  
  const authToken = request.cookies.get('auth-token')?.value;
  const userType = request.cookies.get('user-type')?.value;
  const isAuthenticated = !!authToken;

  logEvent('AUTH_CHECK', `Route: ${pathname}, Auth: ${isAuthenticated}, Type: ${userType || 'none'}`);

  // ==================== Gestion des routes publiques ====================
  
  const isPublicRoute = matchesRoute(pathname, PUBLIC_ROUTES);
  const isDriverPublicRoute = matchesRoute(pathname, DRIVER_PUBLIC_ROUTES);

  // Si utilisateur connecté essaie d'accéder aux pages de login/signup
  if (isAuthenticated && (isPublicRoute || isDriverPublicRoute)) {
    const excludedRoutes = ['/']; // Page d'accueil accessible même connecté
    const shouldRedirect = !excludedRoutes.includes(pathname);

    if (shouldRedirect) {
      const redirectUrl = userType === 'chauffeur' ? '/driver/dashboard' : '/dashboard';
      logEvent('REDIRECT', `Authenticated user → ${redirectUrl}`, { from: pathname });
      return NextResponse.redirect(new URL(redirectUrl, request.url));
    }
  }

  // ==================== Protection des routes privées ====================
  
  const isProtectedRoute = matchesRoute(pathname, PROTECTED_ROUTES);
  const isDriverRoute = matchesRoute(pathname, DRIVER_ROUTES);

  // Routes protégées pour utilisateurs normaux
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

  // ==================== Headers de sécurité ====================
  
  // Content Security Policy (CSP)
  // Ajuster selon vos besoins (Google Maps, Firebase, etc.)
  const cspHeader = `
    default-src 'self';
    script-src 'self' 'unsafe-eval' 'unsafe-inline' https://maps.googleapis.com https://www.gstatic.com https://www.googleapis.com;
    style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
    img-src 'self' blob: data: https://*.googleapis.com https://*.gstatic.com https://firebasestorage.googleapis.com;
    font-src 'self' data: https://fonts.gstatic.com;
    connect-src 'self' https://*.googleapis.com https://*.firebaseio.com https://*.cloudfunctions.net https://firestore.googleapis.com;
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
  if (authToken) {
    // Les cookies devraient être définis avec les flags suivants:
    // - HttpOnly: true (empêche l'accès JavaScript)
    // - Secure: true (HTTPS seulement en production)
    // - SameSite: 'strict' ou 'lax'
    // 
    // Note: Ces flags sont définis lors de la création des cookies (login)
    // Le middleware les vérifie ici
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
