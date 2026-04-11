// src/components/ui/OTPInput.tsx
'use client';
import React, { useRef, useState, useEffect } from 'react';
import { Loader2 } from 'lucide-react';

interface OTPInputProps {
  email: string;
  onVerify: (code: string) => Promise<{ success: boolean; error?: string; attemptsLeft?: number }>;
  onResend: () => Promise<{ success: boolean; error?: string }>;
  onSuccess?: () => void;
  loading?: boolean;
}

export default function OTPInput({ email, onVerify, onResend, onSuccess, loading = false }: OTPInputProps) {
  const [digits, setDigits] = useState(['', '', '', '', '', '']);
  const [error, setError] = useState<string | null>(null);
  const [attemptsLeft, setAttemptsLeft] = useState(3);
  const [verifying, setVerifying] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  // Countdown 60s au montage
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d?$/.test(value)) return;
    const updated = [...digits];
    updated[index] = value;
    setDigits(updated);
    setError(null);
    if (value && index < 5) {
      inputsRef.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(''));
      inputsRef.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const code = digits.join('');
    if (code.length !== 6) {
      setError('Veuillez saisir les 6 chiffres du code.');
      return;
    }
    setVerifying(true);
    setError(null);
    const result = await onVerify(code);
    setVerifying(false);
    if (result.success) {
      onSuccess?.();
    } else {
      setError(result.error ?? 'Code incorrect.');
      if (result.attemptsLeft !== undefined) setAttemptsLeft(result.attemptsLeft);
      setDigits(['', '', '', '', '', '']);
      inputsRef.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    setResendLoading(true);
    setError(null);
    const result = await onResend();
    setResendLoading(false);
    if (result.success) {
      setCountdown(60);
      setDigits(['', '', '', '', '', '']);
      setAttemptsLeft(3);
    } else {
      setError(result.error ?? 'Erreur lors du renvoi. Réessayez.');
    }
  };

  const isLoading = loading || verifying;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <p className="text-gray-600 text-sm">
          Un code a été envoyé à <span className="font-semibold text-[#101010]">{email}</span>
        </p>
      </div>

      {/* 6 inputs */}
      <div className="flex justify-center gap-3" onPaste={handlePaste}>
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={(el) => { inputsRef.current[i] = el; }}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            disabled={isLoading}
            className={`w-11 h-14 text-center text-xl font-bold border-2 rounded-xl focus:outline-none transition-colors
              ${error ? 'border-red-400 bg-red-50' : digit ? 'border-[#f29200] bg-orange-50' : 'border-gray-300 bg-white'}
              ${isLoading ? 'opacity-50 cursor-not-allowed' : 'focus:border-[#f29200]'}
            `}
          />
        ))}
      </div>

      {/* Erreur + tentatives */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-center">
          <p className="text-red-600 text-sm">{error}</p>
          {attemptsLeft > 0 && attemptsLeft < 3 && (
            <p className="text-red-400 text-xs mt-1">{attemptsLeft} tentative{attemptsLeft > 1 ? 's' : ''} restante{attemptsLeft > 1 ? 's' : ''}</p>
          )}
        </div>
      )}

      {/* Bouton Vérifier */}
      <button
        type="button"
        onClick={handleVerify}
        disabled={isLoading || digits.join('').length < 6}
        className="w-full bg-[#f29200] text-white font-bold py-4 rounded-xl hover:bg-[#e68600] transition-colors flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {verifying ? <Loader2 className="animate-spin mr-2 h-5 w-5" /> : null}
        Vérifier mon email
      </button>

      {/* Renvoyer le code */}
      <div className="text-center">
        <p className="text-gray-500 text-sm">Vous n'avez rien reçu ?</p>
        {countdown > 0 ? (
          <p className="text-gray-400 text-sm mt-1">Renvoyer dans <span className="font-semibold text-[#f29200]">{countdown}s</span></p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="mt-1 text-[#f29200] font-semibold text-sm hover:underline disabled:opacity-50"
          >
            {resendLoading ? 'Envoi...' : 'Renvoyer le code'}
          </button>
        )}
      </div>
    </div>
  );
}
