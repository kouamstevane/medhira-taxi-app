'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  collection, 
  query, 
  onSnapshot, 
  doc, 
  getDoc,
  limit,
  orderBy
} from 'firebase/firestore';
import { db, auth } from '@/config/firebase';
import { 
  Search, 
  User as UserIcon,
  ChevronRight,
  ShieldCheck,
  MoreVertical,
  UserPlus,
  UserMinus,
  ChefHat,
  Car
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import AdminHeader from '@/components/admin/AdminHeader';

interface UserData {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber?: string;
  userType: 'client' | 'chauffeur' | 'restaurateur';
  createdAt: any;
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
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    const checkAdmin = async () => {
      const user = auth.currentUser;
      if (!user) {
        setIsAdmin(false);
        router.push('/login');
        return;
      }

      try {
        const adminDoc = await getDoc(doc(db, 'admins', user.uid));
        if (adminDoc.exists()) {
          setIsAdmin(true);
        } else {
          // Fallback: chercher dans la collection où userId correspond à l'UID
          const { getDocs, where, collection } = await import('firebase/firestore');
          const adminQuery = query(
            collection(db, 'admins'),
            where('userId', '==', user.uid)
          );
          const adminSnapshot = await getDocs(adminQuery);
          
          if (!adminSnapshot.empty) {
            setIsAdmin(true);
          } else {
            setIsAdmin(false);
            router.push('/dashboard');
          }
        }
      } catch (err) {
        console.error('Error checking admin status:', err);
        setIsAdmin(false);
      }
    };

    checkAdmin();
  }, [router]);

  useEffect(() => {
    if (!isAdmin) return;

    setLoading(true);
    const usersRef = collection(db, 'users');
    const q = query(usersRef, orderBy('createdAt', 'desc'), limit(100));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const usersData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as UserData[];
      
      setUsers(usersData);
      setLoading(false);
    }, (err) => {
      console.error('Error fetching users:', err);
      toast.error('Erreur lors du chargement des utilisateurs');
      setLoading(false);
    });

    return () => unsubscribe();
  }, [isAdmin]);

  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!auth.currentUser) return;
    
    setProcessing(userId);
    try {
      const idToken = await auth.currentUser.getIdToken(true);
      const response = await fetch('/api/admin/manage-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`
        },
        body: JSON.stringify({
          userId,
          role: newRole,
          adminUid: auth.currentUser.uid
        })
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Erreur lors de la mise à jour');

      toast.success(data.message || 'Rôle mis à jour');
    } catch (err: any) {
      console.error('Error updating role:', err);
      toast.error(err.message || 'Erreur de mise à jour');
    } finally {
      setProcessing(null);
    }
  };

  const filteredUsers = users.filter(user => 
    user.firstName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.lastName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    user.phoneNumber?.includes(searchQuery)
  );

  const getRoleIcon = (role: string) => {
    switch(role) {
      case 'restaurateur': return <ChefHat className="w-4 h-4" />;
      case 'chauffeur': return <Car className="w-4 h-4" />;
      default: return <UserIcon className="w-4 h-4" />;
    }
  };

  if (isAdmin === null) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 text-slate-900">
      <AdminHeader 
        title="Gestion des Utilisateurs" 
        subtitle="Attribution des rôles et permissions" 
      />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col md:flex-row gap-4 mb-8 items-center justify-between">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input 
              type="text" 
              placeholder="Rechercher par nom, email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 outline-none shadow-sm"
            />
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-3xl overflow-hidden shadow-sm">
          {loading ? (
            <UserSkeleton />
          ) : filteredUsers.length === 0 ? (
            <div className="py-24 text-center">
              <UserIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold">Aucun utilisateur trouvé</h3>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Utilisateur</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Type Actuel</th>
                    <th className="px-6 py-4 text-left text-[11px] font-bold text-gray-500 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {filteredUsers.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-4">
                          <div className="h-10 w-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 font-bold">
                            {user.firstName?.[0]}{user.lastName?.[0]}
                          </div>
                          <div>
                            <div className="text-sm font-semibold">{user.firstName} {user.lastName}</div>
                            <div className="text-[11px] text-gray-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold uppercase border ${
                          user.userType === 'restaurateur' ? 'bg-purple-50 text-purple-600 border-purple-100' :
                          user.userType === 'chauffeur' ? 'bg-blue-50 text-blue-600 border-blue-100' :
                          'bg-gray-50 text-gray-600 border-gray-100'
                        }`}>
                          {getRoleIcon(user.userType)}
                          {user.userType}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          {user.userType !== 'restaurateur' ? (
                            <button
                              onClick={() => handleUpdateRole(user.id, 'restaurateur')}
                              disabled={!!processing}
                              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 transition-all disabled:opacity-50"
                            >
                              <ChefHat className="w-3.5 h-3.5" />
                              Promouvoir Restaurateur
                            </button>
                          ) : (
                            <button
                              onClick={() => handleUpdateRole(user.id, 'client')}
                              disabled={!!processing}
                              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-bold hover:bg-gray-50 text-rose-600 transition-all disabled:opacity-50"
                            >
                              <UserMinus className="w-3.5 h-3.5" />
                              Retirer accès
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
