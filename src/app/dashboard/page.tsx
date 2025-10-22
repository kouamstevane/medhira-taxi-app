"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { auth, db } from "../lib/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, updateDoc } from 'firebase/firestore';

export default function Dashboard() {
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(2);
  const [userData, setUserData] = useState({
    phoneNumber: "",
    firstName: "",
    lastName: "",
    photoURL: "/images/default.png",
    userType: "client" // 'client' ou 'chauffeur'
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const userDoc = await getDoc(doc(db, "users", user.uid));
        const userDataFromDB = userDoc.exists() ? userDoc.data() : {};

        setUserData(prev => ({
          ...prev,
          phoneNumber: user.phoneNumber || "",
          firstName: userDataFromDB.firstName || "",
          lastName: userDataFromDB.lastName || "",
          photoURL: userDataFromDB.profileImageUrl || user.photoURL || "/images/default.png",
          userType: userDataFromDB.userType || "client"
        }));
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      router.push("/login");
    } catch (error) {
      console.error("Erreur de déconnexion :", error);
      alert("Erreur lors de la déconnexion");
    }
  };

  const handleNotifications = () => {
    alert("Voir les notifications");
    setNotifCount(0);
  };

  return (
    <div className="min-h-screen bg-[#e6e6e6]">
      {/* Entête fixe */}
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
          <button
            onClick={handleNotifications}
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

          {/* Profil avec menu déroulant */}
          <div className="relative group">
            <button className="flex items-center space-x-2 focus:outline-none">
              <img
                src={userData.photoURL}
                alt="Profil"
                className="w-9 h-9 rounded-full object-cover border-2 border-[#f29200] shadow-sm"
              />
              <span className="hidden sm:inline text-sm font-medium text-white">{userData.firstName}</span>
            </button>

            {/* Menu déroulant */}
            <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
              <div className="px-4 py-3 border-b border-gray-100">
                <p className="font-semibold text-gray-900">{userData.firstName} {userData.lastName}</p>
                <p className="text-xs text-gray-500 truncate">{userData.phoneNumber}</p>
              </div>
              <button
                onClick={logout}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition"
              >
                🔐 Déconnexion
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Contenu principal */}
      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-6">
        {/* Bannière de bienvenue */}
        <div className="bg-gradient-to-br from-[#101010] via-[#1a1a1a] to-[#2a2a2a] text-white rounded-2xl p-6 mb-8 shadow-xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#f29200] opacity-10 rounded-full -translate-y-16 translate-x-16"></div>
          <div className="relative flex flex-col sm:flex-row items-start">
            <img
              src={userData.photoURL}
              alt="Profil"
              className="w-20 h-20 rounded-full object-cover border-4 border-[#f29200] shadow-lg mb-4 sm:mb-0 sm:mr-6"
            />
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold mb-1">
                👋 Bonjour, {userData.firstName}
              </h2>
              <p className="text-gray-300 text-sm mb-3">
                Prêt à démarrer votre journée ?
              </p>
              <div className="space-y-2 text-sm">
                <p className="flex items-center">
                  <svg className="h-4 w-4 mr-2 text-[#f29200]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                  </svg>
                  {userData.phoneNumber || "Non renseigné"}
                </p>
                <p className="flex items-center">
                  <svg className="h-4 w-4 mr-2 text-[#f29200]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  <span className="font-medium">Statut :</span>
                  <span className={`ml-1 px-2 py-0.5 rounded-full text-xs font-bold ${
                    userData.userType === 'chauffeur'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-blue-100 text-blue-800'
                  }`}>
                    {userData.userType === 'chauffeur' ? 'Chauffeur' : 'Client'}
                  </span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Services principaux */}
        <section className="mb-8">
          <h3 className="text-lg font-bold text-[#101010] mb-5 flex items-center">
            <svg className="h-5 w-5 mr-2 text-[#f29200]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
            </svg>
            Nos Services
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            {/* Taxi */}
            <div
              onClick={() => router.push("/taxi")}
              className="group p-5 bg-white rounded-xl shadow-md hover:shadow-xl border border-gray-200 transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
            >
              <div className="flex items-center">
                <div className="w-14 h-14 bg-[#f29200] bg-opacity-10 rounded-full flex items-center justify-center mr-4 group-hover:scale-110 transition">
                  <svg className="h-7 w-7 text-[#f29200]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1v-1a1 1 0 011-1h2a1 1 0 011 1v1a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H19a1 1 0 001-1V5a1 1 0 00-1-1H3z" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-[#101010] group-hover:text-[#f29200] transition">Commander un taxi</h4>
                  <p className="text-sm text-gray-600">Déplacement rapide et sécurisé</p>
                </div>
              </div>
            </div>

            {/* Livraison */}
            <div
              onClick={() => router.push("/commander/livraison")}
              className="group p-5 bg-white rounded-xl shadow-md hover:shadow-xl border border-gray-200 transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
            >
              <div className="flex items-center">
                <div className="w-14 h-14 bg-[#f29200] bg-opacity-10 rounded-full flex items-center justify-center mr-4 group-hover:scale-110 transition">
                  <svg className="h-7 w-7 text-[#f29200]" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                </div>
                <div>
                  <h4 className="font-bold text-[#101010] group-hover:text-[#f29200] transition">Livraison express</h4>
                  <p className="text-sm text-gray-600">Colis, repas, urgences</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section chauffeur */}
        {userData.userType === 'chauffeur' && (
          <section className="mb-8">
            <h3 className="text-lg font-bold text-[#101010] mb-5 flex items-center">
              <svg className="h-5 w-5 mr-2 text-[#f29200]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
              </svg>
              Chauffeur
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div
                onClick={() => router.push("/chauffeur/courses")}
                className="p-5 bg-white rounded-xl shadow-md hover:shadow-xl border border-gray-200 transition-all cursor-pointer"
              >
                <h4 className="font-bold text-[#101010] mb-2">Courses en attente</h4>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-[#f29200] rounded-full mr-2 animate-pulse"></div>
                  3 nouvelles demandes
                </div>
              </div>
              <div
                onClick={() => router.push("/chauffeur/historique")}
                className="p-5 bg-white rounded-xl shadow-md hover:shadow-xl border border-gray-200 transition-all cursor-pointer"
              >
                <h4 className="font-bold text-[#101010] mb-2">Historique</h4>
                <div className="flex items-center text-sm text-gray-600">
                  <div className="w-2 h-2 bg-green-500 rounded-full mr-2"></div>
                  15 courses ce mois
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Historique des commandes */}
        <section className="mb-8">
          <div className="flex justify-between items-center mb-5">
            <h3 className="text-lg font-bold text-[#101010] flex items-center">
              <svg className="h-5 w-5 mr-2 text-[#f29200]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
              </svg>
              Dernières commandes
            </h3>
            <button
              onClick={() => router.push("/commandes")}
              className="text-sm text-[#f29200] hover:underline font-medium"
            >
              Voir tout →
            </button>
          </div>
          <div className="space-y-4">
            <div
              onClick={() => router.push("/commandes/1")}
              className="p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-[#101010]">Taxi - Centre ville</h4>
                <span className="text-xs bg-green-100 text-green-800 px-3 py-1 rounded-full font-medium">
                  ✅ Complétée
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Hier à 14:30 • 1 500 FCFA</p>
            </div>
            <div
              onClick={() => router.push("/commandes/2")}
              className="p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer"
            >
              <div className="flex justify-between items-center">
                <h4 className="font-semibold text-[#101010]">Livraison - Restaurant</h4>
                <span className="text-xs bg-blue-100 text-blue-800 px-3 py-1 rounded-full font-medium">
                  🚚 En cours
                </span>
              </div>
              <p className="text-sm text-gray-600 mt-1">Aujourd’hui à 12:15 • 2 000 FCFA</p>
            </div>
          </div>
        </section>

        {/* Bouton principal */}
        <div className="text-center mb-10">
          <button
            onClick={() => router.push("/commander")}
            className="inline-flex items-center space-x-2 bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition transform hover:scale-105"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
            </svg>
            <span>Commander maintenant</span>
          </button>
        </div>

        {/* Menu secondaire */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { icon: "📱", title: "Mon profil", route: "/profil" },
            { icon: "💰", title: "Paiements", route: "/paiements" },
            { icon: "📜", title: "Historique", route: "/historique" },
            { icon: "🛡️", title: "Sécurité", route: "/securite" },
          ].map((item, i) => (
            <div
              key={i}
              onClick={() => router.push(item.route)}
              className="p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-[#f29200] transition cursor-pointer text-center group"
            >
              <div className="text-2xl mb-2 group-hover:scale-110 transition">{item.icon}</div>
              <span className="text-sm font-medium text-[#101010]">{item.title}</span>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}