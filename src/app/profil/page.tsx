"use client";
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { auth, db, storage } from '@/config/firebase';
import { doc, getDoc, updateDoc, setDoc, serverTimestamp, collection, query, where, getDocs, orderBy, limit, Timestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { onAuthStateChanged, User } from "firebase/auth";
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { GlassCard } from '@/components/ui/GlassCard';
import { BottomNav } from '@/components/ui/BottomNav';
import { InputField } from '@/components/forms/InputField';
import { SelectField } from '@/components/forms/SelectField';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { getFirestoreErrorMessage, logFirestoreError } from '@/utils/firestore-error-handler';
import { CURRENCY_CODE, DEFAULT_LOCALE } from '@/utils/constants';

interface ProfileFormData {
  firstName: string;
  lastName: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  bio: string;
}

export default function ProfilPage() {
  const [userData, setUserData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    country: 'Canada',
    bio: ''
  });
  const [profileImage, setProfileImage] = useState<File | null>(null);
  const [profileImageUrl, setProfileImageUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<Record<string, unknown>>>([]);
  const router = useRouter();
  const { currentUser } = useAuth();

  // Initialize form with default values
  const form = useForm<ProfileFormData>({
    defaultValues: {
      firstName: '',
      lastName: '',
      phone: '',
      address: '',
      city: '',
      country: 'Canada',
      bio: '',
    }
  });

  // Update form values when userData changes
  useEffect(() => {
    if (editing) {
      form.reset({
        firstName: userData.firstName,
        lastName: userData.lastName,
        phone: userData.phone,
        address: userData.address,
        city: userData.city,
        country: userData.country,
        bio: userData.bio,
      });
    }
  }, [userData, editing, form]);

  // Reliance on AuthContext for authentication and document existence check.
  // AuthContext now handles signing out if the Firestore document is deleted.
  useEffect(() => {
    const fetchUserData = async () => {
      if (currentUser) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);

        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          setUserData({
            firstName: data.firstName || '',
            lastName: data.lastName || '',
            email: currentUser.email || '',
            phone: data.phone || '',
            address: data.address || '',
            city: data.city || '',
            country: data.country || 'Canada',
            bio: data.bio || ''
          });
          setProfileImageUrl(data.profileImageUrl || '');
          fetchHistory(currentUser.uid);
        } else {
          // Document does not exist, AuthContext should handle sign out
          // and redirection. For safety, we can also redirect here.
          router.push("/login");
        }
      } else if (!currentUser && !loading) {
        router.push("/login");
      }
      setLoading(false);
    };

    fetchUserData();
  }, [currentUser, router]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setUserData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProfileImage(e.target.files[0]);
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfileImageUrl(reader.result as string);
      };
      reader.readAsDataURL(e.target.files[0]);
    }
  };

  const { showSuccess, showError } = useToast();

  const handleSubmit = async (data: ProfileFormData) => {
    setError(null);
    setLoading(true);

    try {
      let imageUrl = profileImageUrl;
      if (profileImage) {
        const storageRef = ref(storage, `profile_images/${currentUser?.uid}`);
        const snapshot = await uploadBytes(storageRef, profileImage);
        imageUrl = await getDownloadURL(snapshot.ref);
      }

      const user = auth.currentUser;
      if (!user) throw new Error("No user");

      const userRef = doc(db, 'users', user.uid);
      await setDoc(userRef, {
        ...data,
        email: user.email,
        profileImageUrl: imageUrl,
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Update local state
      setUserData(prev => ({ ...prev, ...data }));
      setEditing(false);
      showSuccess("Profil mis à jour avec succès");
    } catch (error) {
      // Logger les détails de l'erreur pour le debugging
      logFirestoreError(error, "mise à jour du profil client");

      // Afficher un message d'erreur explicite à l'utilisateur
      const errorMessage = getFirestoreErrorMessage(error, "mise à jour de votre profil");
      showError(errorMessage);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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
        limit(5)
      );
      const parcelsQuery = query(
        collection(db, 'parcels'),
        where('senderId', '==', userId),
        where('createdAt', '>=', Timestamp.fromDate(todayStart)),
        orderBy('createdAt', 'desc'),
        limit(5)
      );

      const [bookingsSnapshot, parcelsSnapshot] = await Promise.all([
        getDocs(bookingsQuery),
        getDocs(parcelsQuery),
      ]);

      const bookings = bookingsSnapshot.docs.map(doc => ({ id: doc.id, type: 'Taxi', ...doc.data() }));
      const parcels = parcelsSnapshot.docs.map(doc => ({ id: doc.id, type: 'Livraison', ...doc.data() }));

      const combinedHistory = [...bookings, ...parcels].sort((a, b) => {
        const aCreatedAt = (a as Record<string, unknown>).createdAt as { toMillis?: () => number; seconds?: number } | undefined;
        const bCreatedAt = (b as Record<string, unknown>).createdAt as { toMillis?: () => number; seconds?: number } | undefined;
        const aTime = aCreatedAt?.toMillis ? aCreatedAt.toMillis() : (aCreatedAt?.seconds ? aCreatedAt.seconds * 1000 : 0);
        const bTime = bCreatedAt?.toMillis ? bCreatedAt.toMillis() : (bCreatedAt?.seconds ? bCreatedAt.seconds * 1000 : 0);
        return bTime - aTime;
      });

      setHistory(combinedHistory.slice(0, 5));
    } catch (error) {
      console.error("Erreur chargement historique:", error);
      // Ne pas bloquer l'affichage du profil si l'historique échoue
    }
  };


  const countries = ['Canada', 'France', 'Belgique', 'Cameroun', 'Autre'];

  if (loading && !editing) {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased flex items-center justify-center">
        <MaterialIcon name="refresh" className="animate-spin text-primary text-[48px]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased">
      <div className="max-w-[430px] mx-auto px-4 pt-6 pb-28">
        {/* Header */}
        <div className="flex items-center mb-6">
          <Link href="/dashboard" className="mr-4 p-2 rounded-full hover:bg-white/5 transition">
            <MaterialIcon name="arrow_back" className="text-white" />
          </Link>
          <h1 className="text-2xl font-bold text-white">Mon Profil</h1>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 text-destructive rounded-xl">
            <div className="flex justify-between items-center">
              <p>{error}</p>
              <button
                onClick={() => setError(null)}
                className="text-destructive hover:text-red-300 font-bold"
              >
                <MaterialIcon name="close" size="sm" />
              </button>
            </div>
          </div>
        )}

        {/* Profile Card */}
        <GlassCard className="p-6">
          {/* Avatar */}
          <div className="flex flex-col items-center mb-6">
            <div className="relative w-28 h-28 rounded-full overflow-hidden border-2 border-primary/40 mb-4">
              {profileImageUrl ? (
                <Image
                  src={profileImageUrl}
                  alt="Photo de profil"
                  width={128}
                  height={128}
                  className="w-full h-full object-cover"
                  priority
                  unoptimized={profileImageUrl.includes('googleusercontent.com')}
                  onError={(e) => {
                    const target = e.target as HTMLImageElement;
                    target.style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-full h-full bg-white/5 flex items-center justify-center">
                  <MaterialIcon name="person" className="text-slate-500 text-[48px]" />
                </div>
              )}
            </div>

            {editing && (
              <label className="cursor-pointer bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold py-2 px-4 rounded-2xl primary-glow transition flex items-center gap-2">
                <MaterialIcon name="photo_camera" size="sm" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
                Changer la photo
              </label>
            )}
          </div>

          {/* Form / View */}
          {editing ? (
            <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">

              <InputField
                  type="email"
                  label="Email"
                  value={userData.email}
                  disabled
                  helperText="L'adresse email ne peut pas être modifiée."
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  {...form.register('firstName')}
                  label="Prénom"
                  placeholder="Prénom"
                  required
                />
                <InputField
                  {...form.register('lastName')}
                  label="Nom"
                  placeholder="Nom"
                  required
                />
              </div>

              <div className="flex">
                 <InputField
                  type="tel"
                  {...form.register('phone')}
                  label="Numéro de téléphone"
                  placeholder="514XXXXXXX"
                  helperText="Format sans le code pays (+1)."
                  required
                />
              </div>

              <InputField
                  type="text"
                  {...form.register('address')}
                  label="Adresse"
                  placeholder="Votre adresse actuelle"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <InputField
                  type="text"
                  {...form.register('city')}
                  label="Ville"
                  placeholder="Votre ville"
                />
                <SelectField
                  {...form.register('country')}
                  label="Pays"
                  options={countries.map(c => ({ value: c, label: c }))}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-1">A propos de moi</label>
                <textarea
                  {...form.register('bio')}
                  rows={4}
                  className="glass-input w-full rounded-xl p-4 text-white placeholder:text-slate-500 outline-none transition-all focus:ring-2 focus:ring-primary"
                  placeholder="Parlez-nous un peu de vous..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-6 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setEditing(false);
                    setError(null);
                    form.reset();
                  }}
                  className="glass-card border border-white/10 text-slate-300 px-6 py-3 font-medium rounded-2xl hover:bg-white/5 transition-all active:scale-[0.98]"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="px-8 py-3 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow transition-all active:scale-[0.98] flex items-center gap-2"
                >
                  {loading ? <MaterialIcon name="refresh" className="animate-spin" size="sm" /> : "Enregistrer"}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-sm text-slate-500">Email</p>
                <p className="font-medium text-white">{userData.email || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Prénom</p>
                <p className="font-medium text-white">{userData.firstName || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Nom</p>
                <p className="font-medium text-white">{userData.lastName || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Téléphone</p>
                <p className="font-medium text-white">{userData.phone ? `+1 ${userData.phone}` : 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Adresse</p>
                <p className="font-medium text-white">{userData.address || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Ville</p>
                <p className="font-medium text-white">{userData.city || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">Pays</p>
                <p className="font-medium text-white">{userData.country || 'Non renseigné'}</p>
              </div>
              <div>
                <p className="text-sm text-slate-500">A propos</p>
                <p className="font-medium text-white whitespace-pre-line">{userData.bio || 'Aucune description'}</p>
              </div>
              <div className="flex justify-end pt-4">
                <button
                  onClick={() => setEditing(true)}
                  className="px-6 py-3 bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow transition-all active:scale-[0.98]"
                >
                  Modifier le profil
                </button>
              </div>
            </div>
          )}
        </GlassCard>

        {/* Section Dernières commandes */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-white">Commandes du jour</h2>
            <Link href="/historique" className="text-sm font-medium text-primary hover:text-[#ffae33] transition">
              Voir tout →
            </Link>
          </div>
          <div className="space-y-3">
            {history.length > 0 ? (
              history.map(item => {
                const createdAt = item.createdAt as { seconds?: number; toMillis?: () => number } | undefined;
                const timestamp = createdAt?.seconds ? createdAt.seconds * 1000 : (createdAt?.toMillis ? createdAt.toMillis() : Date.now());
                const destination = item.destination as string | undefined;
                const description = item.description as string | undefined;
                const price = item.price as number | undefined;
                const status = item.status as string | undefined;
                const type = item.type as string | undefined;
                const id = item.id as string | undefined;

                return (
                  <GlassCard key={id} className="p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-white">{type} - {destination || description}</p>
                      <p className="text-sm text-slate-400">
                        {new Date(timestamp).toLocaleDateString(DEFAULT_LOCALE, { day: '2-digit', month: '2-digit', year: 'numeric' })} à {new Date(timestamp).toLocaleTimeString(DEFAULT_LOCALE, { hour: '2-digit', minute: '2-digit' })} • {price?.toLocaleString(DEFAULT_LOCALE, { minimumFractionDigits: 2 })} {CURRENCY_CODE}
                      </p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                      status === 'completed' || status === 'delivered'
                        ? 'bg-green-500/10 text-green-400'
                        : 'bg-blue-500/10 text-blue-400'
                    }`}>
                      {status}
                    </span>
                  </GlassCard>
                );
              })
            ) : (
              <GlassCard className="p-8 text-center">
                <p className="text-slate-400">Aucune commande aujourd&apos;hui.</p>
                <Link href="/historique" className="text-sm text-primary hover:text-[#ffae33] mt-2 inline-block transition">
                  Voir l&apos;historique complet
                </Link>
              </GlassCard>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Navigation */}
      <BottomNav />
    </div>
  );
}
