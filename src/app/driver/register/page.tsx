// src/app/driver/register/page.tsx
"use client";
import { auth } from '@/config/firebase';
import { useToast } from '@/hooks/useToast';
import { ToastContainer } from '@/components/ui/Toast';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useConnectivityMonitor } from '@/hooks/useConnectivityMonitor';
import { useDriverRegistration } from '@/hooks/useDriverRegistration';
import Step0RoleSelection from './components/Step0RoleSelection';
import Step1Intent from './components/Step1Intent';
import Step2Identity from './components/Step2Identity';
import Step3Vehicle from './components/Step3Vehicle';
import Step4Compliance from './components/Step4Compliance';
import Step5Monetization from './components/Step5Monetization';

export default function DriverRegisterWizard() {
  const { toasts, removeToast, showWarning } = useToast();
  const isOnline = useConnectivityMonitor(showWarning);
  const {
    currentStep, loading, error, warning, isSubmitting, submissionSuccess,
    rejectionCode, rejectionReason,
    driverType, setVehicleType,
    step1Data, step2Data, step3Data, biometricsPhoto, vehicleFiles, complianceFiles,
    handleStep0Next, handleGoogleSignIn, handleStep1Next, handleStep2Next, handleStep3Next,
    handleStep4Next, handleStep5FinalSubmit, handleFixRejection, handleLogout,
    handleSendVerificationCode, handleVerifyCode,
    setCurrentStep,
    isExistingUser,
  } = useDriverRegistration();

  if (rejectionCode) {
    return (
      <div className="min-h-screen bg-background font-sans text-slate-100 antialiased flex items-center justify-center p-4">
        <div className="glass-card rounded-2xl w-full max-w-lg p-8 text-center">
          <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-destructive/10 border border-destructive/30 mb-6">
            <MaterialIcon name="error" className="text-destructive text-[32px]" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Action Requise</h2>
          <div className="mb-4 p-4 bg-white/5 rounded-xl border border-white/10">
            <span className="font-mono text-xs text-destructive block mb-1">Code: {rejectionCode}</span>
            <p className="text-slate-400">{rejectionReason}</p>
          </div>
          <div className="space-y-3 mt-8">
            {rejectionCode !== 'R005' && (
              <button onClick={handleFixRejection} className="w-full h-14 flex items-center justify-center bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold rounded-2xl primary-glow active:scale-[0.98] transition-transform">
                <MaterialIcon name="edit" size="md" className="mr-2" /> Mettre à jour mon dossier
              </button>
            )}
            <button onClick={handleLogout} className="glass-card w-full h-14 flex items-center justify-center rounded-2xl border border-white/10 text-slate-300 font-bold active:scale-[0.98] transition-transform">
              <MaterialIcon name="logout" size="md" className="mr-2" /> Se déconnecter
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-slate-100 antialiased flex items-center justify-center p-4">
      <ToastContainer toasts={toasts} onRemove={removeToast} position="top-right" />

      {/* Indicateur connectivité */}
      <div className="fixed top-4 right-4 z-50">
        {isOnline ? (
          <div className="flex items-center bg-green-500/10 border border-green-500/20 text-green-400 px-3 py-2 rounded-xl">
            <MaterialIcon name="wifi" size="sm" className="mr-2" />
            <span className="text-sm font-medium">En ligne</span>
          </div>
        ) : (
          <div className="flex items-center bg-destructive/10 border border-destructive/30 text-destructive px-3 py-2 rounded-xl">
            <MaterialIcon name="wifi_off" size="sm" className="mr-2" />
            <span className="text-sm font-medium">Hors ligne</span>
          </div>
        )}
      </div>

      <div className="glass-card rounded-2xl w-full max-w-2xl overflow-hidden">
        {/* Progress bar — 6 étapes: 0 à 5 */}
        <div className="h-2 w-full bg-white/5">
          <div
            className="h-full bg-gradient-to-r from-primary to-[#ffae33] transition-all duration-300"
            style={{ width: `${(currentStep / 5) * 100}%` }}
          />
        </div>

        <div className="p-8">
          {error && (
            <div className="mb-6 p-4 bg-destructive/10 border border-destructive/30 rounded-xl flex">
              <MaterialIcon name="error" size="md" className="text-destructive mr-3 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-destructive">{error}</p>
                <p className="text-sm mt-1 text-slate-400">Si le problème persiste, contactez le support.</p>
              </div>
            </div>
          )}
          {warning && (
            <div className="mb-6 p-4 bg-amber-500/10 border border-amber-500/30 rounded-xl flex">
              <MaterialIcon name="warning" size="md" className="text-amber-400 mr-3 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-amber-300">{warning}</p>
              </div>
            </div>
          )}

          {currentStep === 0 && (
            <Step0RoleSelection onNext={handleStep0Next} />
          )}
          {currentStep === 1 && (
            <Step1Intent
              onNext={handleStep1Next}
              onGoogleSignIn={handleGoogleSignIn}
              loading={loading}
              initialData={step1Data}
              sendVerificationCode={handleSendVerificationCode}
              verifyCode={handleVerifyCode}
              onVerified={() => setCurrentStep(2)}
              emailPreVerified={isExistingUser && auth.currentUser?.emailVerified === true}
            />
          )}
          {currentStep === 2 && (
            <Step2Identity onNext={handleStep2Next} onBack={() => setCurrentStep(1)} loading={loading} initialData={step2Data} initialPhoto={biometricsPhoto} />
          )}
          {currentStep === 3 && (
            <Step3Vehicle
              onNext={handleStep3Next}
              onBack={() => setCurrentStep(2)}
              loading={loading}
              initialData={step3Data}
              initialFiles={vehicleFiles}
              driverType={driverType}
              onVehicleTypeChange={setVehicleType}
            />
          )}
          {currentStep === 4 && (
            <Step4Compliance onNext={handleStep4Next} onBack={() => setCurrentStep(3)} loading={loading} initialFiles={complianceFiles} />
          )}
          {currentStep === 5 && (
            <Step5Monetization onSubmitFinal={handleStep5FinalSubmit} onBack={() => setCurrentStep(4)} loading={loading || isSubmitting} disabled={isSubmitting || submissionSuccess} />
          )}
        </div>
      </div>
    </div>
  );
}
