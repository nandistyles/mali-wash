import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { DEFAULT_SETTINGS } from '../lib/db';
import { db as firestore, isAppCheckConfigured, isFirebaseConfigured } from '../lib/firebase';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { isValidPhone, normalisePhone } from '../lib/phone';
import { formatCurrency } from '../lib/utils';
import type { Settings } from '../types';

const BOOKING_COOLDOWN_KEY = 'mali_public_booking_last_submit';
const BOOKING_COOLDOWN_MS = 60_000;

export default function PublicBooking() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    vehicle: '',
    serviceType: 'basic_wash',
    requestedDate: '',
    requestedTime: ''
  });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const washServices = settings?.services.filter(service => service.type === 'wash') ?? [];

  // Public visitors do not have a staff session, so read the single public
  // price-list document directly from Firestore. Never show stale local
  // defaults as if they were the business's current prices.
  useEffect(() => {
    let cancelled = false;

    if (!isFirebaseConfigured || !isAppCheckConfigured) {
      setError('Online booking is temporarily unavailable. Please contact Mali Wash directly.');
      setLoadingSettings(false);
      return;
    }

    void getDoc(doc(firestore, 'settings', 'global'))
      .then(snapshot => {
        if (cancelled) return;
        if (!snapshot.exists()) {
          setError('Online booking has not been configured yet. Please contact Mali Wash directly.');
          return;
        }
        setSettings({ ...DEFAULT_SETTINGS, ...(snapshot.data() as Partial<Settings>) });
      })
      .catch(() => {
        if (!cancelled) setError('Could not load current services. Check your connection and try again.');
      })
      .finally(() => {
        if (!cancelled) setLoadingSettings(false);
      });

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (washServices.length > 0 && !washServices.some(service => service.id === formData.serviceType)) {
      setFormData(current => ({ ...current, serviceType: washServices[0].id }));
    }
  }, [settings]);

  const handleSubmit = async (e: import("react").FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isFirebaseConfigured || !isAppCheckConfigured || !settings) {
      setError('Online booking is unavailable right now. Please contact Mali Wash directly.');
      return;
    }

    const lastSubmit = Number(localStorage.getItem(BOOKING_COOLDOWN_KEY) || 0);
    if (Date.now() - lastSubmit < BOOKING_COOLDOWN_MS) {
      setError('Your previous request was received. Please wait a minute before booking again.');
      return;
    }

    if (!isValidPhone(formData.phone)) {
      setError('Enter a valid Zimbabwean WhatsApp number, for example 0771234567.');
      return;
    }

    const dateTimeString = `${formData.requestedDate}T${formData.requestedTime}`;
    const requestedTime = new Date(dateTimeString).getTime();
    if (!Number.isFinite(requestedTime) || requestedTime < Date.now() + 30 * 60 * 1000) {
      setError('Choose a time at least 30 minutes from now.');
      return;
    }

    const selectedService = washServices.find(service => service.id === formData.serviceType);
    if (!selectedService) {
      setError('That service is no longer available. Please choose another one.');
      return;
    }

    setSubmitting(true);
    try {
      const bookingId = uuidv4();
      await setDoc(doc(firestore, 'bookings', bookingId), {
        id: bookingId,
        name: formData.name.trim(),
        phone: normalisePhone(formData.phone)!,
        vehicle: formData.vehicle.trim(),
        serviceType: selectedService.id,
        requestedTime,
        status: 'pending',
        createdAt: Date.now()
      });
      localStorage.setItem(BOOKING_COOLDOWN_KEY, String(Date.now()));
      setSubmitted(true);
    } catch (err: any) {
      const denied = err?.code === 'permission-denied' || err?.code === 'failed-precondition';
      setError(denied
        ? 'Booking protection is not active yet. Please contact Mali Wash directly.'
        : 'Your request could not be delivered. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="min-h-screen bg-ink-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center p-8">
          <div className="w-16 h-16 bg-brand-100 text-brand-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <CardTitle className="mb-2">Booking Requested!</CardTitle>
          <p className="text-ink-600 mb-6">
            We've received your request. You will receive a WhatsApp confirmation shortly.
          </p>
          <Button onClick={() => setSubmitted(false)} className="w-full">
            Book Another Wash
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-50 flex flex-col items-center justify-center p-4">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-brand-900 mb-2">Mali Wash</h1>
        <p className="text-ink-600">Book your car wash appointment</p>
      </div>
      
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Wash Details</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div role="alert" className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Name</label>
              <Input 
                required 
                value={formData.name}
                onChange={e => setFormData({...formData, name: e.target.value})}
                placeholder="John Doe" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Phone Number (WhatsApp)</label>
              <Input 
                required 
                type="tel"
                value={formData.phone}
                onChange={e => setFormData({...formData, phone: e.target.value})}
                placeholder="+263 77 123 4567" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Vehicle Make & Model</label>
              <Input 
                required 
                value={formData.vehicle}
                onChange={e => setFormData({...formData, vehicle: e.target.value})}
                placeholder="Toyota Hilux" 
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-ink-700 mb-1">Service Type</label>
              <select 
                className="flex h-12 w-full rounded-md border border-ink-300 bg-white px-4 py-2 text-base ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-600"
                value={formData.serviceType}
                onChange={e => setFormData({...formData, serviceType: e.target.value})}
                disabled={loadingSettings || !settings || washServices.length === 0}
              >
                {washServices.map(service => (
                  <option key={service.id} value={service.id}>
                    {service.name} - {formatCurrency(service.price)}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Date</label>
                <Input 
                  required 
                  type="date"
                  min={new Date().toISOString().slice(0, 10)}
                  value={formData.requestedDate}
                  onChange={e => setFormData({...formData, requestedDate: e.target.value})}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-ink-700 mb-1">Time</label>
                <Input 
                  required 
                  type="time"
                  value={formData.requestedTime}
                  onChange={e => setFormData({...formData, requestedTime: e.target.value})}
                />
              </div>
            </div>
            <Button type="submit" disabled={submitting || loadingSettings || !settings || washServices.length === 0} className="w-full mt-4 h-14 text-lg">
              {submitting ? 'Sending request…' : loadingSettings ? 'Loading services…' : 'Request Booking'}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
