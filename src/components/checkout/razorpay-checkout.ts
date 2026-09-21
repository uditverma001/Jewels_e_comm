'use client';

/**
 * Razorpay Checkout loader.
 *
 * The widget is a third-party script, so it is loaded on demand rather than on
 * every page, and the promise is cached so a customer who retries does not
 * fetch it twice.
 *
 * Note what is NOT passed here: no amount the browser chose. The provider
 * order handle already carries a total bound server-side, and the widget can
 * only pay that.
 */

const SCRIPT_URL = 'https://checkout.razorpay.com/v1/checkout.js';

export interface RazorpaySuccess {
  razorpay_order_id: string;
  razorpay_payment_id: string;
  razorpay_signature: string;
}

interface RazorpayOptions {
  key: string;
  order_id: string;
  name: string;
  description?: string;
  prefill?: { name?: string; email?: string; contact?: string };
  notes?: Record<string, string>;
  theme?: { color?: string };
  handler: (response: RazorpaySuccess) => void;
  modal?: { ondismiss?: () => void };
}

interface RazorpayConstructor {
  new (options: RazorpayOptions): { open: () => void };
}

declare global {
  interface Window {
    Razorpay?: RazorpayConstructor;
  }
}

let loader: Promise<RazorpayConstructor> | null = null;

export function loadRazorpay(): Promise<RazorpayConstructor> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Razorpay can only be loaded in the browser'));
  }
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (loader) return loader;

  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.Razorpay) resolve(window.Razorpay);
      else reject(new Error('Razorpay failed to initialise'));
    };
    script.onerror = () => {
      // Allow a retry rather than caching the failure forever.
      loader = null;
      reject(new Error('Could not load the payment provider'));
    };
    document.head.appendChild(script);
  });

  return loader;
}

export type { RazorpayOptions };
