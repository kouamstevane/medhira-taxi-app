/**
 * Page Dashboard - Tableau de bord utilisateur
 * 
 * Affiche les services disponibles, l'historique des commandes,
 * et les informations utilisateur. Page protégée nécessitant l'authentification.
 * 
 * @page
 */

"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import { auth, db } from "@/config/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { 
  FiCreditCard, FiBell, FiLogOut, FiPhone, FiUser, 
  FiTruck, FiPackage, FiCheckCircle, FiPlus,
  FiSettings, FiShield, FiFileText, FiUsers
} from 'react-icons/fi';

export default function Dashboard() {
  const router = useRouter();
  const [notifCount, setNotifCount] = useState(2);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [history, setHistory] = useState<Array<{
    id: string;
    type: string;
    destination?: string;
    receiverAddress?: string;
    description?: string;
    status: string;
    createdAt: { seconds: number; toMillis: () => number };
    price?: number;
    amount?: number;
  }>>([]);
  const [userData, setUserData] = useState<{
    phoneNumber: string;
    firstName: string;
    lastName: string;
    profileImageUrl: string;
    userType: 'client' | 'chauffeur';
  }>({
    phoneNumber: "",
    firstName: "",
    lastName: "",
    profileImageUrl: "/images/default.png",
    userType: "client"
  });

  const fetchHistory = async (userId: string) => {
    try {
      const bookingsQuery = query(
        collection(db, 'bookings'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(2)
      );
      const parcelsQuery = query(
        collection(db, 'parcels'),
        where('senderId', '==', userId),
        orderBy('createdAt', 'desc'),
        limit(2)
      );

      const [bookingsSnapshot, parcelsSnapshot] = await Promise.all([
        getDocs(bookingsQuery),
        getDocs(parcelsQuery),
      ]);

      const bookings = bookingsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'Taxi',
          destination: data.destination,
          receiverAddress: data.receiverAddress,
          description: data.description,
          status: data.status,
          createdAt: data.createdAt,
          price: data.price,
          amount: data.amount
        };
      });

      const parcels = parcelsSnapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          type: 'Livraison',
          destination: data.destination,
          receiverAddress: data.receiverAddress,
          description: data.description,
          status: data.status,
          createdAt: data.createdAt,
          price: data.price,
          amount: data.amount
        };
      });

      const combinedHistory = [...bookings, ...parcels].sort((a, b) => {
        if (a.createdAt && b.createdAt) {
          return b.createdAt.toMillis() - a.createdAt.toMillis();
        }
        return 0;
      });

      setHistory(combinedHistory.slice(0, 2));
    } catch (error) {
      console.error("Erreur chargement historique:", error);
      // Ne pas bloquer l'affichage du dashboard si l'historique échoue
    }
  };

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
          profileImageUrl: userDataFromDB.profileImageUrl || user.photoURL || "/images/default.png",
          userType: userDataFromDB.userType || "client"
        }));

        // Charger l'historique des commandes
        fetchHistory(user.uid);

        // Vérifier si l'utilisateur est admin
        try {
          const adminDocRef = doc(db, 'admins', user.uid);
          const adminDoc = await getDoc(adminDocRef);
          
          if (adminDoc.exists()) {
            setIsAdmin(true);
          } else {
            // Fallback: chercher dans la collection où userId correspond à l'UID
            const adminQuery = query(
              collection(db, 'admins'),
              where('userId', '==', user.uid)
            );
            const adminSnapshot = await getDocs(adminQuery);
            setIsAdmin(!adminSnapshot.empty);
          }
        } catch (err) {
          console.error('Erreur vérification admin:', err);
          setIsAdmin(false);
        }
      } else {
        router.push("/login");
      }
    });

    return () => unsubscribe();
  }, [router]);

  const logout = async () => {
    try {
      await signOut(auth);
      // Forcer le rechargement complet pour vider le cache
      window.location.href = "/login";
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
          <FiTruck className="h-7 w-7 mr-2 text-[#f29200]" />
          Medjira Service
        </h1>

        <div className="flex items-center space-x-2 sm:space-x-4">
                      {/* Link to Driver Space - Visible uniquement pour les chauffeurs */}
                      {userData.userType === 'chauffeur' && (
                        <Link
                          href="/driver/dashboard"
                          className="flex items-center space-x-2 bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg transition duration-200 shadow-md"
                          aria-label="Espace chauffeur"
                        >
                          <FiUser className="h-5 w-5" />
                          <span className="hidden sm:inline text-sm font-medium">Chauffeur</span>
                        </Link>
                      )}
                      
                      {/* Admin Button - Visible uniquement pour les admins */}
                      {isAdmin && (
                        <button
                          onClick={() => router.push('/admin/drivers')}
                          className="flex items-center space-x-2 bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-lg transition duration-200 shadow-md"
                          aria-label="Administration"
                        >
                          <FiShield className="h-5 w-5" />
                          <span className="hidden sm:inline text-sm font-medium">Admin</span>
                        </button>
                      )}

          {/* Wallet Button */}
          <button
            onClick={() => router.push('/wallet')}
            className="flex items-center space-x-2 bg-[#f29200] hover:bg-[#e08800] text-white px-3 py-2 rounded-lg transition duration-200 shadow-md"
            aria-label="Portefeuille"
          >
            <FiCreditCard className="h-5 w-5" />
            <span className="hidden sm:inline text-sm font-medium">Wallet</span>
          </button>

          {/* Notifications */}
          <button
            onClick={handleNotifications}
            className="relative p-2 rounded-full hover:bg-[#333] transition duration-200 group"
            aria-label="Notifications"
          >
            <FiBell className="h-6 w-6 text-white group-hover:text-[#f29200] transition" />
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
                src={userData.profileImageUrl}
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
              {isAdmin && (
                <button
                  onClick={() => router.push('/admin/drivers')}
                  className="block w-full text-left px-4 py-2 text-sm text-purple-600 hover:bg-purple-50 hover:text-purple-700 transition flex items-center"
                >
                  <FiShield className="h-4 w-4 mr-2" />
                  Administration
                </button>
              )}
              <button
                onClick={logout}
                className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 transition flex items-center"
              >
                <FiLogOut className="h-4 w-4 mr-2" />
                Déconnexion
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
              src={userData.profileImageUrl}
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
                  <FiPhone className="h-4 w-4 mr-2 text-[#f29200]" />
                  {userData.phoneNumber || "Non renseigné"}
                </p>
                <p className="flex items-center">
                  <FiUser className="h-4 w-4 mr-2 text-[#f29200]" />
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

        {/* Section Admin - Visible uniquement pour les admins */}
        {isAdmin && (
          <section className="mb-8">
            <h3 className="text-lg font-bold text-[#101010] mb-5 flex items-center">
              <FiShield className="h-5 w-5 mr-2 text-purple-600" />
              Administration
            </h3>
            <div
              onClick={() => router.push("/admin/drivers")}
              className="group p-5 bg-gradient-to-r from-purple-50 to-purple-100 rounded-xl shadow-md hover:shadow-xl border-2 border-purple-200 transition-all duration-300 cursor-pointer transform hover:-translate-y-1"
            >
              <div className="flex items-center">
                <div className="w-14 h-14 bg-purple-600 rounded-full flex items-center justify-center mr-4 group-hover:scale-110 transition">
                  <FiUsers className="h-7 w-7 text-white" />
                </div>
                <div>
                  <h4 className="font-bold text-[#101010] group-hover:text-purple-600 transition">Gérer les comptes chauffeurs</h4>
                  <p className="text-sm text-gray-600">Valider ou refuser les demandes d&apos;inscription</p>
                </div>
              </div>
            </div>
          </section>
        )}

        {/* Services principaux */}
        <section className="mb-8">
          <h3 className="text-lg font-bold text-[#101010] mb-5 flex items-center">
            <FiTruck className="h-5 w-5 mr-2 text-[#f29200]" />
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
                  <FiTruck className="h-7 w-7 text-[#f29200]" />
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
                  <FiPackage className="h-7 w-7 text-[#f29200]" />
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
              <FiUser className="h-5 w-5 mr-2 text-[#f29200]" />
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
              <FiFileText className="h-5 w-5 mr-2 text-[#f29200]" />
              Dernières commandes
            </h3>
            <button
              onClick={() => router.push("/profil")}
              className="text-sm text-[#f29200] hover:underline font-medium flex items-center"
            >
              Voir tout <span className="ml-1">→</span>
            </button>
          </div>
          <div className="space-y-4">
            {history.length > 0 ? (
              history.map(item => (
                <div
                  key={item.id}
                  className="p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md transition cursor-pointer"
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-[#101010]">
                      {item.type} - {item.destination || item.receiverAddress || item.description || 'Non spécifié'}
                    </h4>
                    <span className={`text-xs px-3 py-1 rounded-full font-medium flex items-center ${
                      item.status === 'completed' || item.status === 'delivered' 
                        ? 'bg-green-100 text-green-800' 
                        : item.status === 'in_progress' || item.status === 'accepted'
                        ? 'bg-blue-100 text-blue-800'
                        : item.status === 'cancelled'
                        ? 'bg-red-100 text-red-800'
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {item.status === 'completed' || item.status === 'delivered' ? (
                        <><FiCheckCircle className="h-3 w-3 mr-1" /> Complétée</>
                      ) : item.status === 'in_progress' || item.status === 'accepted' ? (
                        <><FiTruck className="h-3 w-3 mr-1" /> En cours</>
                      ) : item.status === 'cancelled' ? (
                        <>Annulée</>
                      ) : (
                        <>En attente</>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {item.createdAt && new Date(item.createdAt.seconds * 1000).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' })} à {item.createdAt && new Date(item.createdAt.seconds * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })} • {item.price || item.amount || 'N/A'} FCFA
                  </p>
                </div>
              ))
            ) : (
              <div className="p-8 bg-white rounded-xl shadow-sm border border-gray-200 text-center">
                <FiPackage className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500 font-medium">Aucune commande récente</p>
                <p className="text-sm text-gray-400 mt-1">Commencez par réserver un taxi ou une livraison</p>
              </div>
            )}
          </div>
        </section>

        {/* Bouton principal */}
        <div className="text-center mb-10">
          <button
            onClick={() => router.push("/commander")}
            className="inline-flex items-center space-x-2 bg-[#f29200] hover:bg-[#e68600] text-white font-bold py-4 px-8 rounded-xl shadow-lg hover:shadow-xl transition transform hover:scale-105"
          >
            <FiPlus className="h-5 w-5" />
            <span>Commander maintenant</span>
          </button>
        </div>

        {/* Menu secondaire */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          {[
            { icon: FiSettings, title: "Mon profil", route: "/profil" },
            { icon: FiCreditCard, title: "Paiements", route: "/paiements" },
            { icon: FiFileText, title: "Historique", route: "/historique" },
            { icon: FiShield, title: "Sécurité", route: "/securite" },
          ].map((item, i) => {
            const IconComponent = item.icon;
            return (
            <div
              key={i}
              onClick={() => router.push(item.route)}
              className="p-4 bg-white rounded-xl shadow-sm border border-gray-200 hover:shadow-md hover:border-[#f29200] transition cursor-pointer text-center group"
            >
                <div className="flex justify-center mb-2">
                  <IconComponent className="h-6 w-6 text-gray-600 group-hover:text-[#f29200] group-hover:scale-110 transition" />
                </div>
              <span className="text-sm font-medium text-[#101010]">{item.title}</span>
            </div>
            );
          })}
        </section>
      </main>
    </div>
  );
}