'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { MaterialIcon } from '@/components/ui/MaterialIcon';
import { useCartStore } from '@/store/cartStore';
import { CURRENCY_CODE } from '@/utils/constants';

export const CartDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { items, restaurant, updateQuantity, getTotalItems, getSubtotal } = useCartStore();

  const totalItems = getTotalItems();
  const subtotal = getSubtotal();

  if (totalItems === 0 || !restaurant) {
    return null;
  }

  return (
    <>
      {/* Floating Button when drawer is closed */}
      {!isOpen && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 w-full max-w-md px-4">
          <button
            onClick={() => setIsOpen(true)}
            className="w-full bg-gradient-to-r from-primary to-[#ffae33] text-white rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-primary/25 hover:opacity-95 transition-all transform hover:scale-[1.02] active:scale-95 primary-glow"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <MaterialIcon name="shopping_bag" size="lg" />
                <span className="absolute -top-2 -right-2 bg-white text-primary w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border-2 border-primary">
                  {totalItems}
                </span>
              </div>
              <div className="flex flex-col items-start">
                <span className="text-sm font-medium opacity-90">Voir le panier</span>
                <span className="text-xs opacity-75 truncate max-w-[150px]">{restaurant.name}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 font-bold text-lg">
              {subtotal.toFixed(2)} {CURRENCY_CODE}
              <MaterialIcon name="chevron_right" size="md" className="opacity-80" />
            </div>
          </button>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-50 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed inset-x-0 bottom-0 z-50 glass-card rounded-t-3xl shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col max-h-[90vh] border-t border-white/10 ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="p-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#1A1A1A]/90 backdrop-blur-xl z-10 rounded-t-3xl">
          <h2 className="text-xl font-bold text-white">Votre commande</h2>
          <button
            onClick={() => setIsOpen(false)}
            className="p-2 text-slate-400 hover:bg-white/10 rounded-full transition-colors"
          >
            <MaterialIcon name="close" size="lg" />
          </button>
        </div>

        <div className="p-4 bg-white/5 border-b border-white/5">
          <p className="text-xs text-slate-500 font-medium">Depuis</p>
          <h3 className="text-base font-bold text-white">{restaurant.name}</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between items-start py-2 border-b border-white/5 last:border-0">
              <div className="flex-1 pr-4">
                <h4 className="font-medium text-white">{item.name}</h4>
                <p className="text-primary font-semibold mt-1">{(item.price * item.quantity).toFixed(2)} {CURRENCY_CODE}</p>

                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-4 bg-white/10 rounded-full px-3 py-1.5 w-fit">
                    <button
                      onClick={() => updateQuantity(item.id!, item.quantity - 1)}
                      className="text-slate-300 hover:text-white"
                    >
                      <MaterialIcon name="remove" size="sm" />
                    </button>
                    <span className="font-semibold text-sm w-4 text-center text-white">{item.quantity}</span>
                    <button
                      onClick={() => updateQuantity(item.id!, item.quantity + 1)}
                      className="text-slate-300 hover:text-white"
                    >
                      <MaterialIcon name="add" size="sm" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-white/5 bg-[#1A1A1A]/90 backdrop-blur-xl sticky bottom-0">
          <div className="flex justify-between items-center mb-4 text-lg">
            <span className="font-semibold text-slate-300">Sous-total</span>
            <span className="font-bold text-white">{subtotal.toFixed(2)} {CURRENCY_CODE}</span>
          </div>

          <Link href="/food/checkout" onClick={() => setIsOpen(false)} className="block w-full">
            <button className="w-full bg-gradient-to-r from-primary to-[#ffae33] text-white font-bold text-lg py-4 rounded-xl primary-glow hover:opacity-90 transition-opacity active:scale-[0.98]">
              Passer la commande
            </button>
          </Link>
        </div>
      </div>
    </>
  );
};
