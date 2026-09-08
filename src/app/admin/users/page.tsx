'use client';

import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  onSnapshot,
  limit,
  orderBy,
  startAfter,
  getDocs,
  getDoc,
  doc,
  DocumentSnapshot,
} from 'firebase/firestore';

const PAGE_SIZE = 25;
import { httpsCallable } from 'firebase/functions';
import { db, auth, functions } from '@/config/firebase';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { UserMobileCard } from '@/components/admin/UserMobileCard';
import { UserDetailsDrawer, type AdminUserDriverProfile, type AdminUserRestaurantProfile } from '@/components/admin/UserDetailsDrawer';
import type { DriverPrivate } from '@/types/firestore-collections';
import { toast } from 'react-hot-toast';
import AdminHeader from '@/components/admin/AdminHeader';
import { BottomNav, adminNavItems } from '@/components/ui/BottomNav';
import { useAdminAuth } from '@/hooks/useAdminAuth';
import { createLogger } from '@/utils/logger';
import {
  buildAdminManageUserPayload,
  groupUsersByIdentity,
  type AdminManageableRole,
  type AdminUserRole,
} from './adminUsersUi';

const logger = createLogger('AdminUsers');

// V1 (spec §3) : roles cumulatifs sur users/{uid}. La présence d'un sous-objet vaut « capacité présente ».
interface UserRolesShape {
  client?: { enabled?: boolean };
  driver?: { joinedAt?: unknown };
  restaurant?: { restaurantId?: string };
}

interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  profileImageUrl?: string;
  profileImage?: string;
  photoURL?: string;
  emailVerified?: boolean;
  roles?: UserRolesShape;
  activeRole?: 'client' | 'driver' | 'restaurant';
  lastActiveRole?: 'client' | 'driver' | 'restaurant';
  accountState?: string;
  country?: string;
  address?: string;
  city?: string;
  bio?: string;
  createdAt: unknown;
  updatedAt?: unknown;
}

const UserSkeleton = () => (
  <div className="space-y-4 animate-pulse p-4">
    {[1, 2, 3, 4, 5].map((i) => (
      <div key={i} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-32 bg-white/10 rounded" />
            <div className="h-3 w-24 bg-white/10 rounded" />
          </div>
        </div>
        <div className="h-4 w-24 bg-white/10 rounded" />
      </div>
    ))}
  </div>
);

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserData[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [processing, setProcessing] = useState<string | null>(null);
  const [lastDoc, setLastDoc] = useState<DocumentSnapshot | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [selectedUser, setSelectedUser] = useState<ReturnType<typeof groupUsersByIdentity>[number] | null>(null);
  const [selectedDriverProfile, setSelectedDriverProfile] = useState<AdminUserDriverProfile | null>(null);
  const [selectedDriverPrivate, setSelectedDriverPrivate] = useState<DriverPrivate | null>(null);
  const [selectedRestaurantProfile, setSelectedRestaurantProfile] = useState<AdminUserRestaurantProfile | null>(null);
  const isAdmin = useAdminAuth();

  useEffect(() => {
    if (!isAdmin) return;

    setLoading(true);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];

      setUsers(usersData);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
      setLoading(false);
    }, (err) => {
      logger.error('Chargement des utilisateurs', err instanceof Error ? err : new Error(String(err)));
      toast.error('Erreur lors du chargement des utilisateurs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const loadMore = async () => {
    if (!lastDoc || loadingMore) return;
    setLoadingMore(true);
    try {
      const usersRef = collection(db, 'users');
      const q = query(usersRef, orderBy('createdAt', 'desc'), startAfter(lastDoc), limit(PAGE_SIZE));

      const snapshot = await getDocs(q);
      const newUsers = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];

      setUsers(prev => [...prev, ...newUsers]);
      setLastDoc(snapshot.docs[snapshot.docs.length - 1] || null);
      setHasMore(snapshot.docs.length === PAGE_SIZE);
    } catch (err) {
      logger.error('Chargement page suivante', err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleRemoveRole = async (userId: string, role: AdminManageableRole) => {
    if (!auth.currentUser) return;

    setProcessing(userId);
    try {
      const adminManageUser = httpsCallable(functions, 'adminManageUser');
      const result = await adminManageUser(buildAdminManageUserPayload(userId, role));
      const data = result.data as { success: boolean; message: string };

      toast.success(data.message || 'Rôle mis à jour');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erreur de mise à jour';
      logger.error(`Retrait du rôle ${role}`, err instanceof Error ? err : new Error(String(err)));
      toast.error(message);
    } finally {
      setProcessing(null);
    }
  };

  const groupedUsers = groupUsersByIdentity(users);
  const filteredUsers = groupedUsers.filter(user =>
    user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phoneNumber?.includes(searchQuery)
  );

  const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
  const pagedUsers = filteredUsers.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const getRoleIcon = (role: AdminUserRole) => {
    switch(role) {
      case 'restaurant': return <MaterialIcon name="restaurant" size="sm" />;
      case 'driver': return <MaterialIcon name="directions_car" size="sm" />;
      default: return <MaterialIcon name="person" size="sm" />;
    }
  };

  useEffect(() => {
    if (!selectedUser) {
      setSelectedDriverProfile(null);
      setSelectedDriverPrivate(null);
      setSelectedRestaurantProfile(null);
      return;
    }

    const driverId = selectedUser.roleUserIds.driver;
    if (!driverId) {
      setSelectedDriverProfile(null);
      setSelectedDriverPrivate(null);
    }

    const restaurantId = selectedUser.roleDetails.restaurant?.restaurantId;
    if (!driverId && !restaurantId) {
      setSelectedRestaurantProfile(null);
      return;
    }

    let cancelled = false;
    const driverRequests = driverId
      ? Promise.all([getDoc(doc(db, 'drivers', driverId)), getDoc(doc(db, 'drivers', driverId, 'private', 'personal'))])
      : Promise.resolve(null);
    const restaurantRequest = restaurantId
      ? getDoc(doc(db, 'restaurants', restaurantId))
      : Promise.resolve(null);

    void Promise.all([driverRequests, restaurantRequest]).then(([driverResult, restaurantSnapshot]) => {
      if (cancelled) return;
      if (driverResult) {
        const [driverSnapshot, privateSnapshot] = driverResult;
        setSelectedDriverProfile(driverSnapshot.exists() ? driverSnapshot.data() as AdminUserDriverProfile : null);
        setSelectedDriverPrivate(privateSnapshot.exists() ? privateSnapshot.data() as DriverPrivate : null);
      }
      setSelectedRestaurantProfile(restaurantSnapshot?.exists() ? restaurantSnapshot.data() as AdminUserRestaurantProfile : null);
    }).catch(() => {
      if (cancelled) return;
      setSelectedDriverProfile(null);
      setSelectedDriverPrivate(null);
      setSelectedRestaurantProfile(null);
    });

    return () => { cancelled = true; };
  }, [selectedUser]);

  const getRoleLabel = (role: AdminUserRole) => {
    switch (role) {
      case 'restaurant': return 'Restaurateur';
      case 'driver': return 'Chauffeur';
      default: return 'Client';
    }
  };

  // TODO: index Firestore dédié si la liste devient volumineuse (P2).
  // En V1 on filtre applicativement après lecture (Firestore where sur nested object
  // `roles.driver` n'est pas indexé par défaut, et la donnée est nullable).

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-white">
      <AdminHeader
        title="Gestion des Utilisateurs"
        subtitle="Attribution des rôles et permissions"
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
          <div className="relative w-full md:w-96">
            <MaterialIcon name="search" size="sm" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Rechercher par nom, email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="glass-input w-full pl-10 pr-4 py-2.5 rounded-xl text-sm"
            />
          </div>
        </div>

        <div className="glass-card rounded-3xl overflow-hidden border border-white/5">
          {loading ? (
            <UserSkeleton />
          ) : filteredUsers.length === 0 ? (
            <div className="py-24 text-center">
              <MaterialIcon name="person" size="xl" className="mx-auto text-slate-500 mb-4" />
              <h3 className="text-lg font-semibold text-white">Aucun utilisateur trouvé</h3>
            </div>
          ) : (
            <div>
              <div className="block space-y-1.5 p-2.5 md:hidden">
                {pagedUsers.map((user) => (
                    <UserMobileCard
                      key={user.id}
                      user={user}
                      isProcessing={processing === user.roleUserIds.restaurant || processing === user.roleUserIds.driver}
                      isDisabled={!!processing}
                      onRemoveRole={handleRemoveRole}
                      onSelect={() => setSelectedUser(user)}
                    />
                ))}
              </div>

              <div className="hidden overflow-x-auto md:block">
              <table className="min-w-full divide-y divide-white/5">
                <thead className="bg-white/[0.03]">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Utilisateur</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Rôles actifs</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-slate-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pagedUsers.map((user) => {
                    const hasRestaurantRole = user.roles.includes('restaurant');
                    const manageableRoles = user.roles.filter(
                      (role): role is AdminManageableRole => role === 'restaurant' || role === 'driver',
                    );
                    return (
                    <tr key={user.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary font-bold">
                            {user.firstName?.[0]}{user.lastName?.[0]}
                          </div>
                          <div>
                            <button
                              type="button"
                              onClick={() => setSelectedUser(user)}
                              className="text-left text-sm font-semibold text-white transition-colors hover:text-primary"
                            >
                              {user.firstName} {user.lastName}
                            </button>
                            <div className="text-[11px] text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-wrap gap-1.5">
                          {user.roles.map((role) => (
                            <span key={role} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase ${
                              role === 'restaurant' ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                              role === 'driver' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                              'bg-white/5 text-slate-400 border-white/10'
                            }`}>
                              {getRoleIcon(role)}
                              {getRoleLabel(role)}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {hasRestaurantRole && (
                            <a
                              href="/admin/restaurants/"
                              className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10"
                            >
                              <MaterialIcon name="store" size="sm" />
                              Gérer dans Restaurants
                            </a>
                          )}
                          {manageableRoles.map((role) => (
                            <button
                              key={role}
                              onClick={() => handleRemoveRole(user.roleUserIds[role] ?? user.id, role)}
                              disabled={!!processing}
                              className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-1.5 text-xs font-bold text-destructive transition-all hover:bg-destructive/20 disabled:opacity-50"
                            >
                              <MaterialIcon name="person_remove" size="sm" />
                              Retirer accès {role === 'restaurant' ? 'restaurateur' : 'chauffeur'}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setSelectedUser(user)}
                            className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-slate-300 transition-all hover:bg-white/10"
                            aria-label={`Voir la fiche de ${user.firstName} ${user.lastName}`}
                          >
                            <MaterialIcon name="chevron_right" size="sm" />
                            Fiche complète
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>

              {/* Pagination controls */}
              <div className="flex items-center justify-between border-t border-white/5 px-4 py-4 sm:px-6">
                <span className="text-xs text-slate-500">
                  {filteredUsers.length} identité{filteredUsers.length !== 1 ? 's' : ''}
                  {searchQuery ? ' trouvés' : ' chargés'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setCurrentPage(p => Math.max(0, p - 1))}
                    disabled={currentPage === 0}
                    className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    title="Page précédente"
                  >
                    <MaterialIcon name="chevron_left" size="sm" />
                  </button>
                  <span className="text-xs text-slate-400 px-2">
                    {currentPage + 1} / {totalPages || 1}
                  </span>
                  {currentPage < totalPages - 1 ? (
                    <button
                      onClick={() => setCurrentPage(p => p + 1)}
                      className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 transition-all"
                      title="Page suivante"
                    >
                      <MaterialIcon name="chevron_right" size="sm" />
                    </button>
                  ) : hasMore ? (
                    <button
                      onClick={() => {
                        loadMore();
                        setCurrentPage(p => p + 1);
                      }}
                      disabled={loadingMore}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-semibold hover:bg-primary/20 transition-all disabled:opacity-50"
                    >
                      {loadingMore ? 'Chargement...' : 'Charger plus'}
                    </button>
                  ) : (
                    <button disabled className="p-2 rounded-lg bg-white/5 border border-white/10 text-slate-400 opacity-30 cursor-not-allowed">
                      <MaterialIcon name="chevron_right" size="sm" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      {selectedUser && (
        <UserDetailsDrawer
          user={selectedUser}
          driverProfile={selectedDriverProfile}
          driverPrivate={selectedDriverPrivate}
          restaurantProfile={selectedRestaurantProfile}
          onClose={() => setSelectedUser(null)}
        />
      )}
      <BottomNav items={adminNavItems} />
    </div>
  );
}
