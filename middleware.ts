/**
 * Middleware Next.js
 * 
 * Intercepte les requêtes pour gérer l'authentification
 * et les redirections avant que les pages ne soient rendues.
 * 
 * @see https://nextjs.org/docs/app/building-your-application/routing/middleware
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Routes publiques (accessibles sans authentification)
 */
const publicRoutes = ['/', '/login', '/signup'];

/**
 * Routes protégées nécessitant une authentification
 */
const protectedRoutes = ['/dashboard', '/taxi', '/wallet', '/driver'];

/**
 * Routes réservées aux chauffeurs
 */
const driverRoutes = ['/driver'];

/**
 * Middleware principal
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Vérifier si la route est publique
  const isPublicRoute = publicRoutes.some(route => pathname === route || pathname.startsWith(`${route}/`));
  
  // Vérifier si la route est protégée
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route));
  
  // Vérifier si la route est réservée aux chauffeurs
  const isDriverRoute = driverRoutes.some(route => pathname.startsWith(route));

  // Récupérer le token d'authentification (exemple avec cookie)
  const token = request.cookies.get('auth-token')?.value;
  const userType = request.cookies.get('user-type')?.value;

  // Si route protégée et pas de token, rediriger vers login
  if (isProtectedRoute && !token) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Si route chauffeur et utilisateur n'est pas chauffeur
  if (isDriverRoute && userType !== 'chauffeur') {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Si utilisateur connecté essaie d'accéder à login/signup, rediriger vers dashboard
  if (token && (pathname === '/login' || pathname === '/signup')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Ajouter des headers de sécurité
  const response = NextResponse.next();
  
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'origin-when-cross-origin');

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
     * - _next/static (fichiers statiques)
     * - _next/image (optimisation d'images)
     * - favicon.ico
     * - fichiers publics (images, etc.)
     */
    '/((?!_next/static|_next/image|favicon.ico|images/).*)',
  ],
};
