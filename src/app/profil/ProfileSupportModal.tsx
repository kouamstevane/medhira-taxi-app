'use client';

import React from 'react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useTranslation } from '@/hooks/useTranslation';

interface ProfileSupportModalProps {
  readonly isOpen: boolean;
  readonly onClose: () => void;
}

export function ProfileSupportModal({ isOpen, onClose }: ProfileSupportModalProps) {
  const { t, locale } = useTranslation();

  const whatsappMessage = locale === 'en'
    ? encodeURIComponent('Hello Medjira, I need assistance')
    : encodeURIComponent("Bonjour Medjira, j'ai besoin d'assistance");

  const emailSubject = locale === 'en'
    ? encodeURIComponent('Medjira Support Request')
    : encodeURIComponent("Demande d'assistance Medjira");

  const supportChannels = [
    {
      title: t('profile.whatsappSupport'),
      subtitle: t('profile.chatWithAdvisor'),
      icon: 'chat',
      href: `https://wa.me/237693372118?text=${whatsappMessage}`,
      badge: t('profile.support247'),
      color: 'bg-emerald-500/15 border-emerald-500/25 text-emerald-400',
    },
    {
      title: t('profile.phoneCall'),
      subtitle: '+237 693 372 118',
      icon: 'call',
      href: 'tel:+237693372118',
      badge: undefined,
      color: 'bg-sky-500/15 border-sky-500/25 text-sky-400',
    },
    {
      title: t('profile.emailSupport'),
      subtitle: 'support@medjira.com',
      icon: 'mail',
      href: `mailto:support@medjira.com?subject=${emailSubject}`,
      badge: undefined,
      color: 'bg-purple-500/15 border-purple-500/25 text-purple-300',
    },
  ];

  return (
    <BottomSheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      onCloseRequest={onClose}
      title={t('profile.customerService')}
      showCloseButton
      closeLabel={t('common.close')}
      className="bg-[#18181b] border-white/10 text-white max-h-[90vh] sm:max-w-md"
    >
      <div className="space-y-4 pb-2">
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          <div className="w-10 h-10 rounded-2xl bg-purple-500/15 border border-purple-500/25 flex items-center justify-center text-purple-300 shrink-0">
            <MaterialIcon name="support_agent" className="text-[22px]" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{t('profile.atYourService')}</p>
          </div>
        </div>

        <div className="space-y-2.5">
          {supportChannels.map((channel) => (
            <a
              key={channel.title}
              href={channel.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-3.5 rounded-2xl bg-white/[0.03] border border-white/5 hover:bg-white/[0.07] active:scale-[0.98] transition-all min-h-[44px]"
            >
              <div className="flex items-center gap-3.5">
                <div className={`w-10 h-10 rounded-2xl border flex items-center justify-center ${channel.color} shrink-0`}>
                  <MaterialIcon name={channel.icon} className="text-[20px]" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{channel.title}</p>
                  <p className="text-xs text-slate-400">{channel.subtitle}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
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
            className="w-full h-12 min-h-[44px] rounded-2xl bg-white/10 hover:bg-white/15 text-white text-sm font-semibold transition active:scale-[0.98]"
          >
            {t('common.close')}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
