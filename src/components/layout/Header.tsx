/**
 * Composant Header
 * 
 * En-tête de l'application avec navigation, notifications et profil utilisateur.
 * Utilisé dans le layout principal pour maintenir la cohérence.
 * 
 * @component
 */

'use client';

import React from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'firebase/auth';
import { auth } from '@/config/firebase';
import { UserData } from '@/types';

interface HeaderProps {
  userData: UserData | null;
  notifCount?: number;
  onNotificationClick?: () => void;
}

/**
 * Header de l'application avec menu utilisateur et notifications
 */
export const Header: React.FC<HeaderProps> = ({
  userData,
  notifCount = 0,
  onNotificationClick,
}) => {
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      router.push('/login');
    } catch (error) {
      console.error('Erreur de déconnexion:', error);
    }
  };

  return (
    <header className="bg-[#101010] text-white flex items-center justify-between px-4 sm:px-6 py-3 sticky top-0 z-50 shadow-lg border-b border-[#333]">
      <h1 className="text-xl sm:text-2xl font-bold flex items-center">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-7 w-7 mr-2 text-[#f29200]"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
        </svg>
        Medjira Service
      </h1>

      <div className="flex items-center space-x-2 sm:space-x-4">
        {/* Notifications */}
        {onNotificationClick && (
          <button
            onClick={onNotificationClick}
            className="relative p-2 rounded-full hover:bg-[#333] transition duration-200 group"
            aria-label="Notifications"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6 text-white group-hover:text-[#f29200] transition"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.6 0 00-9.33-5.032"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M13.73 21a2 2 0 01-3.46 0"
              />
            </svg>
            {notifCount > 0 && (
              <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center animate-pulse">
                {notifCount}
              </span>
            )}
          </button>
        )}

        {/* Profil avec menu déroulant */}
        {userData && (
          <div className="relative group">
            <button className="flex items-center space-x-2 focus:outline-none">
              <img
                src={userData.profileImageUrl || '/images/default.png'}
                alt="Profil"
                className="w-9 h-9 rounded-full object-cover border-2 border-[#f29200] shadow-sm"
              />
              <span className="hidden sm:inline text-sm font-medium text-white">
                {userData.firstName}
              </span>
            </button>

            {/* Menu déroulant */}
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-900">
                  {userData.firstName} {userData.lastName}
                </p>
                <p className="text-xs text-gray-500 truncate">{userData.phoneNumber || userData.email}</p>
              </div>
              <button
                onClick={() => router.push('/profil')}
                className="block w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition"
              >
                👤 Mon profil
              </button>
              <button
                onClick={handleLogout}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition"
              >
                🔐 Déconnexion
              </button>
            </div>
          </div>
        )}
      </div>
    </header>
  );
};
