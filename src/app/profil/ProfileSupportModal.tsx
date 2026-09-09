'use client';

import React from 'react';
import { MaterialIcon } from '@/components/ui/MaterialIcon';

interface ProfileSupportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ProfileSupportModal({ isOpen, onClose }: ProfileSupportModalProps) {
  if (!isOpen) return null;

  const supportChannels = [
    {
      title: 'WhatsApp Support',
      subtitle: 'Discutez directement avec un conseiller',
      icon: 'chat',
      href: 'https://wa.me/237693372118?text=Bonjour%20Medjira%2C%20j%27ai%20besoin%20d%27assistance',
      badge: '24/7',
      color: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
    },
    {
      title: 'Appel Téléphonique',
      subtitle: '+237 693 372 118',
      icon: 'call',
      href: 'tel:+237693372118',
      color: 'bg-sky-500/15 border-sky-500/25 text-sky-400',
    },
    {
      title: 'Support par Email',
      subtitle: 'support@medjira.com',
      icon: 'mail',
      href: 'mailto:support@medjira.com?subject=Demande%20d%27assistance%20Medjira',
      color: 'bg-purple-500/15 border-purple-500/25 text-purple-300',
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4 transition-opacity animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-3xl bg-[#18181b] border border-white/10 p-6 shadow-2xl space-y-5 animate-in slide-in-from-bottom duration-250"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-300">
              <MaterialIcon name="support_agent" className="text-[22px]" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-white">Service Client</h3>
              <p className="text-xs text-slate-400">Nous sommes à votre disposition</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition"
            aria-label="Fermer"
          >
            <MaterialIcon name="close" size="sm" />
          </button>
        </div>

        <div className="space-y-3">
          {supportChannels.map((channel) => (
            <a
              key={channel.title}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] active:scale-[0.98] transition-all"
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${channel.color}`}>
                  <MaterialIcon name={channel.icon} className="text-[20px]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{channel.title}</p>
                  <p className="text-xs text-slate-400">{channel.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {channel.badge && (
                  <span className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {channel.badge}
                  </span>
                )}
                <MaterialIcon name="chevron_right" className="text-slate-500 text-[18px]" />
              </div>
            </a>
          ))}
        </div>

        <div className="pt-2">
          <button
            type="button"
            onClick={onClose}
            className="w-full h-11 rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-medium transition active:scale-[0.98]"
          >
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
