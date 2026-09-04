/**
 * Composant Loading Global
 * 
 * Affiche un écran de chargement avec animation pendant que l'application
 * ou une page se charge. Utilisé automatiquement par Next.js App Router.
 * 
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/loading
 */

'use client';

import React from 'react';

/**
 * Loading - Écran de chargement global
 * 
 * Next.js affiche automatiquement ce composant pendant le chargement
 * des pages en mode streaming.
 */
export default function Loading() {
  return (
    <div
      className="min-h-screen bg-[#0F0F0F] flex items-center justify-center"
      style={{
        minHeight: '100vh',
        backgroundColor: '#0F0F0F',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#FFFFFF',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        margin: 0,
        padding: '24px',
        boxSizing: 'border-box',
      }}
    >
      <div
        className="text-center"
        style={{
          textAlign: 'center',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '320px',
          width: '100%',
        }}
      >
        {/* Logo animé */}
        <div
          className="relative w-24 h-24 mx-auto mb-8"
          style={{
            position: 'relative',
            width: '96px',
            height: '96px',
            margin: '0 auto 32px auto',
          }}
        >
          {/* Cercle de fond */}
          <div
            className="absolute inset-0 bg-[#f29200] rounded-full opacity-20 animate-ping"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: '#f29200',
              borderRadius: '9999px',
              opacity: 0.2,
            }}
          />

          {/* Logo principal */}
          <div
            className="relative w-24 h-24 bg-[#f29200] rounded-full flex items-center justify-center shadow-2xl animate-pulse"
            style={{
              position: 'relative',
              width: '96px',
              height: '96px',
              backgroundColor: '#f29200',
              borderRadius: '9999px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="48"
              height="48"
              viewBox="0 0 20 20"
              fill="#FFFFFF"
              className="h-12 w-12 text-white"
              style={{
                width: '48px',
                height: '48px',
                maxWidth: '48px',
                maxHeight: '48px',
                display: 'block',
              }}
            >
              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3zM3 5h2v2H3V5zm0 4h2v2H3V9zm0 4h2v2H3v-2zm12-8h2v2h-2V5zm0 4h2v2h-2V9zm0 4h2v2h-2v-2z" />
            </svg>
          </div>
        </div>

        {/* Texte */}
        <h2
          className="text-2xl font-bold text-white mb-2"
          style={{
            fontSize: '24px',
            fontWeight: 700,
            color: '#FFFFFF',
            margin: '0 0 8px 0',
            fontFamily: 'inherit',
          }}
        >
          Medjira
        </h2>
        <p
          className="text-[#9CA3AF] animate-pulse"
          style={{
            color: '#9CA3AF',
            fontSize: '14px',
            margin: 0,
            fontFamily: 'inherit',
          }}
        >
          Chargement en cours...
        </p>

        {/* Barre de progression */}
        <div
          className="w-64 h-2 bg-white/10 rounded-full mt-6 mx-auto overflow-hidden"
          style={{
            width: '256px',
            maxWidth: '100%',
            height: '6px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderRadius: '9999px',
            marginTop: '24px',
            marginLeft: 'auto',
            marginRight: 'auto',
            overflow: 'hidden',
          }}
        >
          <div
            className="h-full bg-[#f29200] rounded-full animate-loading-bar"
            style={{
              height: '100%',
              backgroundColor: '#f29200',
              borderRadius: '9999px',
            }}
          />
        </div>
      </div>
    </div>
  );
}




