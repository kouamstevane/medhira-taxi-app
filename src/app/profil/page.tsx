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
import { ChevronLeft, Camera, Loader2 } from 'lucide-react';
import { InputField } from '@/components/forms/InputField';
import { SelectField } from '@/components/forms/SelectField';
import { useToast } from '@/hooks/useToast';
import { useForm } from 'react-hook-form';
import { getFirestoreErrorMessage, logFirestoreError } from '@/utils/firestore-error-handler';

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
  }, [currentUser, loading, router]);

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
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#f29200]"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] p-4 sm:p-6">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center mb-6">
          <Link href="/dashboard" className="mr-4 p-2 rounded-full hover:bg-[#E8D9A5] transition">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-[#2E2307]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </Link>
          <h1 className="text-2xl font-bold text-[#2E2307]">Mon Profil</h1>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-100 border-l-4 border-red-500 text-red-700 rounded">
            <div className="flex justify-between items-center">
              <p>{error}</p>
              <button 
                onClick={() => setError(null)} 
                className="text-red-700 hover:text-red-900 font-bold"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <div className="p-6">
            <div className="flex flex-col items-center mb-6">
              <div className="relative w-32 h-32 rounded-full overflow-hidden border-4 border-[#E8D9A5] mb-4">
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
                  <div className="w-full h-full bg-gray-200 flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {editing && (
                <label className="cursor-pointer bg-[#FDBC01] hover:bg-[#E6A900] text-[#2E2307] font-bold py-2 px-4 rounded-md transition">
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
                  <label className="block text-sm font-medium text-gray-700 mb-1">À propos de moi</label>
                  <textarea 
                    {...form.register('bio')} 
                    rows={4} 
                    className="w-full rounded-xl border border-gray-200 p-4 text-[#101010] placeholder-gray-400 bg-white focus:ring-2 focus:ring-[#f29200] outline-none shadow-sm transition-all" 
                    placeholder="Parlez-nous un peu de vous..." 
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-6 border-t">
                  <button 
                    type="button" 
                    onClick={() => { 
                      setEditing(false); 
                      setError(null);
                      form.reset();
                    }} 
                    className="px-6 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl hover:bg-gray-50 transition-all active:scale-[0.98]"
                  >
                    Annuler
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading} 
                    className="px-8 py-3 bg-[#f29200] hover:bg-[#d98300] text-white font-bold rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center gap-2"
                  >
                    {loading ? <Loader2 className="animate-spin" size={20} /> : "Enregistrer"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-[#5A4A1A]">Email</p>
                  <p className="font-medium text-[#2E2307]">{userData.email || 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">Prénom</p>
                  <p className="font-medium text-[#2E2307]">{userData.firstName || 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">Nom</p>
                  <p className="font-medium text-[#2E2307]">{userData.lastName || 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">Téléphone</p>
                  <p className="font-medium text-[#2E2307]">{userData.phone ? `+1 ${userData.phone}` : 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">Adresse</p>
                  <p className="font-medium text-[#2E2307]">{userData.address || 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">Ville</p>
                  <p className="font-medium text-[#2E2307]">{userData.city || 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">Pays</p>
                  <p className="font-medium text-[#2E2307]">{userData.country || 'Non renseigné'}</p>
                </div>
                <div>
                  <p className="text-sm text-[#5A4A1A]">À propos</p>
                  <p className="font-medium text-[#2E2307] whitespace-pre-line">{userData.bio || 'Aucune description'}</p>
                </div>
                <div className="flex justify-end pt-4">
                  <button onClick={() => setEditing(true)} className="px-4 py-2 bg-[#2E2307] hover:bg-[#3D2F0A] text-[#FDBC01] font-bold rounded-md">Modifier le profil</button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Section Dernières commandes */}
        <div className="mt-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold text-[#2E2307]">Commandes du jour</h2>
            <Link href="/historique" className="text-sm font-medium text-[#FDBC01] hover:underline">
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
                  <div key={id} className="bg-white rounded-lg shadow-sm p-4 flex justify-between items-center">
                    <div>
                      <p className="font-semibold text-gray-800">{type} - {destination || description}</p>
                      <p className="text-sm text-gray-500">
                        {new Date(timestamp).toLocaleDateString('fr-CA', { day: '2-digit', month: '2-digit', year: 'numeric' })} à {new Date(timestamp).toLocaleTimeString('fr-CA', { hour: '2-digit', minute: '2-digit' })} • {price?.toLocaleString('fr-CA', { minimumFractionDigits: 2 })} CAD
                      </p>
                    </div>
                    <span className={`px-3 py-1 text-xs font-medium rounded-full ${status === 'completed' || status === 'delivered' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800'}`}>
                      {status}
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                <p className="text-gray-500">Aucune commande aujourd&apos;hui.</p>
                <Link href="/historique" className="text-sm text-[#FDBC01] hover:underline mt-2 inline-block">
                  Voir l&apos;historique complet
                </Link>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
