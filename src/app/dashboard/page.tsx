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
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { auth, db } from "@/config/firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { notificationService } from '@/services/notification.service';
import { FoodDeliveryService } from '@/services/food-delivery.service';
import type { Restaurant } from '@/types';
import { formatCurrencyWithCode } from '@/utils/format';
import { DEFAULT_URLS } from '@/utils/constants';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
import { redirectWithFallback } from '@/utils/navigation';

export default function Dashboard() {
  const router = useRouter();
  const routerRef = useRef(router);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  routerRef.current = router;
  const [notifCount, setNotifCount] = useState(0);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [isAuthLoading, setIsAuthLoading] = useState(true); // État de chargement de l'auth
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
    userType: 'client' | 'chauffeur' | 'restaurateur';
  }>({
    phoneNumber: "",
    firstName: "",
    lastName: "",
    profileImageUrl: DEFAULT_URLS.DEFAULT_AVATAR,
    userType: "client"
  });
  const [restaurantData, setRestaurantData] = useState<Restaurant | null>(null);
  const [isRestaurantLoading, setIsRestaurantLoading] = useState(false);
  const unsubscribeNotifsRef = useRef<(() => void) | null>(null);

  const fetchHistory = async (userId: string) => {
    try {
      // Obtenir la date du début de la journée (00:00:00)
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
      
      const bookingsQuery = query(
        collection(db, 'bookings'),
        where('userId', '==', userId),
        where('createdAt', '>=', Timestamp.fromDate(todayStart)),
        orderBy('createdAt', 'desc'),
        limit(2)
      );
      const parcelsQuery = query(
        collection(db, 'parcels'),
        where('senderId', '==', userId),
        where('createdAt', '>=', Timestamp.fromDate(todayStart)),
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
        // Lire en parallèle : profil utilisateur, doc chauffeur, doc admin
        const [userDoc, driverDoc, adminDoc] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDoc(doc(db, 'drivers', user.uid)),
          getDoc(doc(db, 'admins', user.uid)),
        ]);

        const userDataFromDB = userDoc.exists() ? userDoc.data() : {};

        setUserData(prev => ({
          ...prev,
          phoneNumber: user.phoneNumber || "",
          firstName: userDataFromDB.firstName || "",
          lastName: userDataFromDB.lastName || "",
          profileImageUrl: userDataFromDB.profileImageUrl || user.photoURL || DEFAULT_URLS.DEFAULT_AVATAR,
          userType: userDataFromDB.userType || "client"
        }));

        // Si restaurateur, charger les infos du restaurant
        if (userDataFromDB.userType === 'restaurateur') {
          setIsRestaurantLoading(true);
          FoodDeliveryService.getRestaurantByOwner(user.uid)
            .then(setRestaurantData)
            .catch((error) => console.error("Erreur chargement restaurant:", error))
            .finally(() => setIsRestaurantLoading(false));
        }

        // Charger l'historique des commandes
        fetchHistory(user.uid);

        // Vérifier si l'utilisateur est aussi chauffeur
        if (driverDoc.exists() && driverDoc.data().status === 'approved') {
          setUserData(prev => ({ ...prev, userType: 'chauffeur' }));
        }

        // Vérifier si l'utilisateur est admin
        try {
          if (adminDoc.exists()) {
            setIsAdmin(true);
          } else {
            // Fallback: chercher dans la collection où userId correspond à l'UID
            const adminQuery = query(
              collection(db, 'admins'),
              where('userId', '==', user.uid),
              limit(1)
            );
            const adminSnapshot = await getDocs(adminQuery);
            setIsAdmin(!adminSnapshot.empty);
          }
        } catch (err) {
          console.error('Erreur vérification admin:', err);
          setIsAdmin(false);
        }

        // Écouter les notifications non lues via le service isolé
        unsubscribeNotifsRef.current?.();
        unsubscribeNotifsRef.current = notificationService.listenUnreadCount(user.uid, setNotifCount);

        // Authentification terminée
        setIsAuthLoading(false);
      } else {
        // Pas d'utilisateur connecté - confirmer et rediriger
        setIsAuthLoading(false);
        redirectTimeoutRef.current = redirectWithFallback(routerRef.current, '/login');
      }
    });

    return () => {
      unsubscribe();
      unsubscribeNotifsRef.current?.();
      if (redirectTimeoutRef.current) clearTimeout(redirectTimeoutRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    try {
      await signOut(auth);
      redirectTimeoutRef.current = redirectWithFallback(router, '/login', { timeoutMs: 2000 });
    } catch (error) {
      console.error("Erreur de déconnexion :", error);
      window.location.replace('/login');
    }
  };

  const handleNotifications = () => {
    router.push("/notifications");
  };

  // Loading screen
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-24 h-24 mx-auto mb-8">
            <div className="absolute inset-0 bg-primary rounded-full opacity-20 animate-ping" />
            <div className="relative w-24 h-24 bg-primary rounded-full flex items-center justify-center shadow-2xl animate-pulse">
              <MaterialIcon name="local_taxi" className="text-white text-[40px]" />
            </div>
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Medjira</h2>
          <p className="text-muted-foreground animate-pulse">Redirection...</p>
        </div>
      </div>
    );
  }

  const initials = `${userData.firstName?.[0] || ''}${userData.lastName?.[0] || ''}`.toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-background text-slate-100 font-sans flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-50 px-4 pt-6 pb-4 bg-background/80 backdrop-blur-md">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {userData.profileImageUrl && userData.profileImageUrl !== DEFAULT_URLS.DEFAULT_AVATAR ? (
              <Image
                src={userData.profileImageUrl}
                alt="Profil"
                width={40}
                height={40}
                className="size-10 rounded-full object-cover"
                unoptimized={userData.profileImageUrl.includes('googleusercontent.com') || userData.profileImageUrl.startsWith('http')}
                onError={(e) => { (e.target as HTMLImageElement).src = DEFAULT_URLS.DEFAULT_AVATAR; }}
              />
            ) : (
              <div className="size-10 rounded-full bg-primary flex items-center justify-center text-background font-bold text-lg">
                {initials}
              </div>
            )}
            <h1 className="text-white text-[18px] font-bold tracking-tight">
              Bonjour, {userData.firstName || 'Utilisateur'}
            </h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <button
              onClick={handleNotifications}
              className="relative p-2 bg-card rounded-full border border-white/5"
              aria-label="Notifications"
            >
              <MaterialIcon name="notifications" size="md" className="text-slate-400 text-[22px]" />
              {notifCount > 0 && (
                <span className="absolute top-2 right-2 size-2 bg-primary rounded-full border border-background" />
              )}
            </button>

            {/* Wallet Badge */}
            <Link
              href="/wallet/historique"
              className="flex items-center gap-1.5 bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full"
            >
              <MaterialIcon name="account_balance_wallet" size="sm" className="text-primary text-[18px] font-bold" />
              <span className="text-primary font-bold text-sm">Wallet</span>
            </Link>

            {/* Admin */}
            {isAdmin && (
              <button
                onClick={() => router.push('/admin/drivers')}
                className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-full"
                aria-label="Administration"
              >
                <MaterialIcon name="admin_panel_settings" size="md" className="text-purple-400" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 px-4 overflow-y-auto pb-32">
        {/* Location Bar */}
        <div className="mt-2 mb-8">
          <GlassCard variant="elevated" className="flex items-center w-full h-14 px-4 gap-3">
            <MaterialIcon name="location_on" className="text-primary" />
            <span className="flex-1 text-slate-100 font-medium">Canada</span>
            <MaterialIcon name="arrow_drop_down" className="text-slate-500" />
          </GlassCard>
        </div>

        {/* Service Grid */}
        <section className="mb-6">
          <h2 className="text-white text-[20px] font-bold mb-4 px-1 tracking-tight">Que voulez-vous faire ?</h2>
          <div className="grid grid-cols-2 gap-4">
            {[
              { icon: 'local_taxi', label: 'Réserver un taxi', sub: 'Dispo maintenant', subColor: 'text-emerald-500', route: '/taxi', highlight: true },
              { icon: 'lunch_dining', label: 'Commander', sub: 'Restaurants', subColor: 'text-slate-400', route: '/food' },
              { icon: 'package_2', label: 'Envoyer un colis', sub: 'Livraison rapide', subColor: 'text-slate-400', route: '/colis' },
              { icon: 'favorite', label: 'Favoris', sub: '3 adresses', subColor: 'text-slate-400', route: '/profil' },
            ].map((service) => (
              <div
                key={service.label}
                onClick={() => router.push(service.route)}
                className={`bg-card p-5 rounded-2xl border border-white/5 flex flex-col gap-4 shadow-lg cursor-pointer active:scale-[0.98] transition-transform ${
                  service.highlight ? 'border-b-4 border-b-primary' : ''
                }`}
              >
                <div className="size-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <MaterialIcon name={service.icon} className="text-primary text-3xl" />
                </div>
                <div>
                  <p className="text-white font-bold text-[16px]">{service.label}</p>
                  <p className={`${service.subColor} text-xs font-medium mt-0.5 flex items-center gap-1`}>
                    {service.highlight && <span className="size-1.5 bg-emerald-500 rounded-full" />}
                    {service.sub}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Driver shortcut */}
        {userData.userType === 'chauffeur' && (
          <section className="mb-6">
            <GlassCard
              variant="bordered"
              className="p-4 cursor-pointer"
              onClick={() => router.push('/driver/dashboard')}
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-emerald-500/10 flex items-center justify-center">
                  <MaterialIcon name="directions_car" className="text-emerald-500" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold">Espace Chauffeur</p>
                  <p className="text-emerald-500 text-xs font-medium">Voir les demandes en cours</p>
                </div>
                <MaterialIcon name="chevron_right" className="text-slate-400" />
              </div>
            </GlassCard>
          </section>
        )}

        {/* Restaurateur shortcut */}
        {userData.userType === 'restaurateur' && restaurantData && (
          <section className="mb-6">
            <GlassCard
              variant="bordered"
              className="p-4 cursor-pointer"
              onClick={() => router.push(`/food/portal/${restaurantData.id}`)}
            >
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-full bg-red-500/10 flex items-center justify-center">
                  <MaterialIcon name="storefront" className="text-red-400" />
                </div>
                <div className="flex-1">
                  <p className="text-white font-bold">{restaurantData.name}</p>
                  <p className="text-slate-400 text-xs">Gérer menus et commandes</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                  restaurantData.status === 'approved' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-amber-500/15 text-amber-500'
                }`}>
                  {restaurantData.status === 'approved' ? 'Actif' : 'En attente'}
                </span>
              </div>
            </GlassCard>
          </section>
        )}

        {/* Recent Rides */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-4 px-1">
            <h2 className="text-white text-[20px] font-bold tracking-tight">Courses récentes</h2>
            <Link href="/historique" className="text-primary font-semibold text-sm">
              Voir tout &rarr;
            </Link>
          </div>
          <div className="space-y-3">
            {history.length > 0 ? (
              history.map((item) => (
                <GlassCard key={item.id} className="p-4 flex items-center gap-4">
                  <div className="size-10 rounded-full bg-slate-800 flex items-center justify-center">
                    <MaterialIcon
                      name={item.type === 'Taxi' ? 'directions_car' : 'restaurant'}
                      className="text-slate-400"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex justify-between items-start">
                      <p className="text-white font-medium text-[15px]">
                        {item.destination || item.receiverAddress || item.description || 'Course'}
                      </p>
                      <span className="text-white font-bold">
                        {formatCurrencyWithCode(item.price ?? item.amount ?? 0)}
                      </span>
                    </div>
                    <p className={`text-xs font-medium mt-0.5 ${
                      item.status === 'completed' || item.status === 'delivered'
                        ? 'text-emerald-500'
                        : item.status === 'cancelled'
                        ? 'text-red-400'
                        : 'text-amber-500'
                    }`}>
                      {item.status === 'completed' || item.status === 'delivered'
                        ? 'Terminé'
                        : item.status === 'cancelled'
                        ? 'Annulé'
                        : 'En cours'}
                    </p>
                  </div>
                </GlassCard>
              ))
            ) : (
              <GlassCard className="p-8 text-center">
                <MaterialIcon name="receipt_long" className="text-slate-600 text-[40px] mx-auto mb-3" />
                <p className="text-slate-400 font-medium">Aucune course aujourd&apos;hui</p>
                <p className="text-sm text-slate-500 mt-1">Réservez un taxi pour commencer</p>
              </GlassCard>
            )}
          </div>
        </section>

        {/* Promo Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-br from-primary/20 to-transparent border border-primary/10 mb-8">
          <p className="text-primary font-bold text-lg mb-1">Parrainez un ami</p>
          <p className="text-slate-300 text-sm leading-relaxed">
            Gagnez 500 XAF sur votre prochaine course en invitant vos proches.
          </p>
        </div>
      </main>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}