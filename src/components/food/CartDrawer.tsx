'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { ShoppingBag, X, ChevronRight, Plus, Minus } from 'lucide-react';
import { useCartStore } from '@/store/cartStore';
import { CURRENCY_CODE } from '@/utils/constants';

export const CartDrawer: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const { items, restaurant, removeItem, updateQuantity, getTotalItems, getSubtotal } = useCartStore();

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
            className="w-full bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-between shadow-lg shadow-primary/25 hover:bg-primary/95 transition-all transform hover:scale-[1.02] active:scale-95"
          >
            <div className="flex items-center gap-3">
              <div className="relative">
                <ShoppingBag className="w-6 h-6" />
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
              <ChevronRight className="w-5 h-5 opacity-80" />
            </div>
          </button>
        </div>
      )}

      {/* Backdrop */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm transition-opacity"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Drawer */}
      <div 
        className={`fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-3xl shadow-2xl transition-transform duration-300 ease-in-out transform flex flex-col max-h-[90vh] ${
          isOpen ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="p-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white z-10 rounded-t-3xl">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-gray-900">Votre commande</h2>
          </div>
          <button 
            onClick={() => setIsOpen(false)}
            className="p-2 text-gray-500 hover:bg-gray-100 rounded-full transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-4 bg-gray-50/50">
          <p className="text-sm font-medium text-gray-500">Depuis</p>
          <h3 className="text-lg font-bold text-gray-900">{restaurant.name}</h3>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {items.map((item) => (
            <div key={item.id} className="flex justify-between items-start py-2 border-b border-gray-50 last:border-0">
              <div className="flex-1 pr-4">
                <h4 className="font-medium text-gray-900">{item.name}</h4>
                <p className="text-primary font-semibold mt-1">{(item.price * item.quantity).toFixed(2)} {CURRENCY_CODE}</p>
                
                <div className="flex items-center gap-3 mt-3">
                  <div className="flex items-center gap-4 bg-gray-100 rounded-full px-3 py-1.5 w-fit">
                    <button 
                      onClick={() => updateQuantity(item.id!, item.quantity - 1)}
                      className="text-gray-600 hover:text-black"
                    >
                      <Minus className="w-4 h-4" />
                    </button>
                    <span className="font-semibold text-sm w-4 text-center">{item.quantity}</span>
                    <button 
                      onClick={() => updateQuantity(item.id!, item.quantity + 1)}
                      className="text-gray-600 hover:text-black"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 border-t border-gray-100 bg-white sticky bottom-0">
          <div className="flex justify-between items-center mb-4 text-lg">
            <span className="font-semibold text-gray-700">Sous-total</span>
            <span className="font-bold text-gray-900">{subtotal.toFixed(2)} {CURRENCY_CODE}</span>
          </div>
          
          <Link href="/food/checkout" onClick={() => setIsOpen(false)} className="block w-full">
            <button className="w-full bg-primary text-primary-foreground font-bold text-lg py-4 rounded-xl shadow-lg hover:opacity-90 transition-opacity active:scale-[0.98]">
              Passer la commande
            </button>
          </Link>
        </div>
      </div>
    </>
  );
};
