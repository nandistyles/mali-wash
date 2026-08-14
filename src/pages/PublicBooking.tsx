import { useEffect, useState } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';
import { ArrowRight, Award, CalendarCheck2, Check, Clock3, MapPin, MessageCircle, ShieldCheck, Sparkles } from 'lucide-react';
import { DEFAULT_SETTINGS } from '../lib/db';
import { db as firestore, isAppCheckConfigured, isFirebaseConfigured } from '../lib/firebase';
import { isValidPhone, normalisePhone } from '../lib/phone';
import { formatCurrency } from '../lib/utils';
import type { Settings } from '../types';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import BrandMark from '../components/BrandMark';

const BOOKING_COOLDOWN_KEY = 'mali_public_booking_last_submit';
const BOOKING_COOLDOWN_MS = 60_000;

export default function PublicBooking() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [formData, setFormData] = useState({ name: '', phone: '', vehicle: '', serviceType: 'basic_wash', requestedDate: '', requestedTime: '' });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const washServices = settings?.services.filter(service => service.type === 'wash') ?? [];
  const selectedService = washServices.find(service => service.id === formData.serviceType);

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
        if (!snapshot.exists()) { setError('Online booking has not been configured yet. Please contact Mali Wash directly.'); return; }
        setSettings({ ...DEFAULT_SETTINGS, ...(snapshot.data() as Partial<Settings>) });
      })
      .catch(() => { if (!cancelled) setError('Could not load current services. Check your connection and try again.'); })
      .finally(() => { if (!cancelled) setLoadingSettings(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (washServices.length && !washServices.some(service => service.id === formData.serviceType)) {
      setFormData(current => ({ ...current, serviceType: washServices[0].id }));
    }
  }, [settings]);

  const handleSubmit = async (event: import('react').FormEvent) => {
    event.preventDefault();
    setError('');
    if (!isFirebaseConfigured || !isAppCheckConfigured || !settings) { setError('Online booking is unavailable right now. Please contact Mali Wash directly.'); return; }
    const lastSubmit = Number(localStorage.getItem(BOOKING_COOLDOWN_KEY) || 0);
    if (Date.now() - lastSubmit < BOOKING_COOLDOWN_MS) { setError('Your previous request was received. Please wait a minute before booking again.'); return; }
    if (!isValidPhone(formData.phone)) { setError('Enter a valid Zimbabwean WhatsApp number, for example 0771234567.'); return; }
    const requestedTime = new Date(`${formData.requestedDate}T${formData.requestedTime}`).getTime();
    if (!Number.isFinite(requestedTime) || requestedTime < Date.now() + 30 * 60 * 1000) { setError('Choose a time at least 30 minutes from now.'); return; }
    if (!selectedService) { setError('That service is no longer available. Please choose another one.'); return; }

    setSubmitting(true);
    try {
      const bookingId = uuidv4();
      await setDoc(doc(firestore, 'bookings', bookingId), {
        id: bookingId, name: formData.name.trim(), phone: normalisePhone(formData.phone)!, vehicle: formData.vehicle.trim(),
        serviceType: selectedService.id, requestedTime, status: 'pending', createdAt: Date.now()
      });
      localStorage.setItem(BOOKING_COOLDOWN_KEY, String(Date.now()));
      setSubmitted(true);
    } catch (err: any) {
      const denied = err?.code === 'permission-denied' || err?.code === 'failed-precondition';
      setError(denied ? 'Booking protection is not active yet. Please contact Mali Wash directly.' : 'Your request could not be delivered. Check your connection and try again.');
    } finally { setSubmitting(false); }
  };

  if (submitted) return (
    <div className="min-h-dvh brand-gradient mali-grid grid place-items-center p-5 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_10%,rgba(75,181,173,.26),transparent_32rem)]" />
      <div className="relative w-full max-w-lg mali-glass rounded-[2rem] p-8 sm:p-11 text-center animate-in-up">
        <div className="w-20 h-20 bg-brand-100 text-brand-700 rounded-[1.5rem] grid place-items-center mx-auto mb-6 shadow-lg ring-8 ring-white/60"><Check className="w-9 h-9" strokeWidth={2.7} /></div>
        <p className="mali-eyebrow justify-center mb-3">Request received</p>
        <h1 className="mali-title">Your car is on our radar.</h1>
        <p className="mali-subtitle mx-auto mt-3">We’ll confirm your wash time on WhatsApp. No payment has been taken yet.</p>
        <div className="mt-7 rounded-2xl bg-brand-50 border border-brand-100 p-4 text-left flex gap-3">
          <MessageCircle className="w-5 h-5 text-brand-700 shrink-0 mt-0.5" />
          <div><p className="font-extrabold text-ink-900">Watch WhatsApp</p><p className="text-xs text-ink-500 mt-1">A Mali Wash team member will confirm your slot shortly.</p></div>
        </div>
        <Button onClick={() => setSubmitted(false)} variant="outline" className="w-full mt-6">Book another vehicle</Button>
      </div>
    </div>
  );

  return (
    <div className="min-h-dvh bg-ink-50">
      <header className="absolute inset-x-0 top-0 z-20 px-5 sm:px-8 py-5 flex items-center justify-between">
        <BrandMark inverse module="Wash" />
        <div className="hidden sm:flex items-center gap-2 text-xs font-bold text-brand-100/70"><MapPin className="w-4 h-4 text-accent-300" /> Ruwa, Zimbabwe</div>
      </header>

      <section className="brand-gradient mali-grid relative overflow-hidden pt-32 pb-28 px-5">
        <div className="absolute -top-44 right-[-7rem] w-[38rem] h-[38rem] bg-brand-400/25 rounded-full blur-3xl" />
        <div className="relative max-w-6xl mx-auto grid lg:grid-cols-[1.05fr_.95fr] gap-12 items-start">
          <div className="text-white pt-5 lg:pt-12 animate-in-up">
            <p className="mali-eyebrow text-accent-300"><Sparkles className="w-4 h-4" /> More than a clean car</p>
            <h1 className="brand-text-gradient mt-5 text-5xl sm:text-6xl lg:text-7xl font-black tracking-[-0.06em] leading-[0.93]">Leave clean.<br />Come back proud.</h1>
            <p className="mt-6 text-lg text-brand-100/75 leading-relaxed max-w-xl">Fast, careful vehicle care in Ruwa—with WhatsApp confirmation, transparent USD pricing, and AutoPoints on every eligible visit.</p>
            <a href="#booking-form" className="sm:hidden mt-7 h-12 px-5 rounded-xl bg-accent-300 text-brand-950 font-extrabold inline-flex items-center gap-2 shadow-lg">Book your wash <ArrowRight className="w-4 h-4" /></a>
            <div className="hidden sm:grid sm:grid-cols-3 gap-3 mt-9 max-w-2xl">
              {[[Clock3, 'Fast booking', 'Choose your preferred slot'], [ShieldCheck, 'Careful service', 'Your vehicle treated right'], [Award, 'AutoPoints', 'Every visit builds value']].map(([Icon, title, detail]) => {
                const FeatureIcon = Icon as typeof Clock3;
                return <div key={String(title)} className="rounded-2xl border border-white/10 bg-white/8 backdrop-blur-sm p-4"><FeatureIcon className="w-5 h-5 text-accent-300 mb-3" /><p className="font-extrabold text-sm">{String(title)}</p><p className="text-[11px] text-brand-100/55 mt-1">{String(detail)}</p></div>;
              })}
            </div>
          </div>

          <Card id="booking-form" className="relative rounded-[1.75rem] shadow-2xl border-white/80 overflow-hidden animate-in-up scroll-mt-5">
            <CardHeader className="pb-4 border-b border-border bg-white">
              <p className="mali-eyebrow"><CalendarCheck2 className="w-4 h-4" /> Reserve a wash</p>
              <CardTitle className="text-2xl mt-2">Choose what your car needs.</CardTitle>
              <p className="text-sm text-ink-500">Request now. We confirm on WhatsApp.</p>
            </CardHeader>
            <CardContent className="pt-5 sm:pt-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                {error && <div role="alert" className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-sm text-red-800">{error}</div>}
                {washServices.length > 0 && <div><label className="label-caps block mb-2">Select a service</label><div className="grid grid-cols-1 sm:grid-cols-3 gap-2">{washServices.map(service => {
                  const selected = service.id === formData.serviceType;
                  return <button key={service.id} type="button" onClick={() => setFormData({ ...formData, serviceType: service.id })} className={`pressable text-left rounded-xl border p-3 ${selected ? 'border-brand-500 bg-brand-50 ring-2 ring-brand-100' : 'border-border bg-white hover:border-brand-300'}`}><p className="text-xs font-extrabold text-ink-900 leading-tight">{service.name}</p><p className={`mt-2 font-black tabular ${selected ? 'text-brand-700' : 'text-ink-600'}`}>{formatCurrency(service.price)}</p></button>;
                })}</div></div>}
                <div><label className="label-caps block mb-2">Your name</label><Input required value={formData.name} onChange={event => setFormData({ ...formData, name: event.target.value })} placeholder="John Doe" /></div>
                <div><label className="label-caps block mb-2">WhatsApp number</label><Input required type="tel" value={formData.phone} onChange={event => setFormData({ ...formData, phone: event.target.value })} placeholder="077 123 4567" /></div>
                <div><label className="label-caps block mb-2">Vehicle</label><Input required value={formData.vehicle} onChange={event => setFormData({ ...formData, vehicle: event.target.value })} placeholder="Toyota Hilux" /></div>
                <select className="sr-only" aria-label="Service type" value={formData.serviceType} onChange={event => setFormData({ ...formData, serviceType: event.target.value })}>{washServices.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}</select>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label-caps block mb-2">Preferred date</label><Input required type="date" min={new Date().toISOString().slice(0, 10)} value={formData.requestedDate} onChange={event => setFormData({ ...formData, requestedDate: event.target.value })} /></div>
                  <div><label className="label-caps block mb-2">Preferred time</label><Input required type="time" value={formData.requestedTime} onChange={event => setFormData({ ...formData, requestedTime: event.target.value })} /></div>
                </div>
                <Button type="submit" size="lg" disabled={submitting || loadingSettings || !settings || !washServices.length} className="w-full mt-4 group">{submitting ? 'Sending request…' : loadingSettings ? 'Loading services…' : `Request ${selectedService?.name ?? 'booking'}`} {!submitting && !loadingSettings && <ArrowRight className="w-4 h-4 ml-auto group-hover:translate-x-0.5 transition-transform" />}</Button>
                <p className="text-[10px] text-center text-ink-400 leading-relaxed">No online payment required · Your requested time is confirmed by our team</p>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>

      <section className="relative -mt-14 px-5 pb-16">
        <div className="max-w-6xl mx-auto mali-glass rounded-[1.5rem] p-5 sm:p-6 grid sm:grid-cols-3 gap-4">
          {[['Transparent pricing', 'See your service price before you request a slot.'], ['WhatsApp updates', 'Your confirmation arrives where you already communicate.'], ['One Mali profile', 'Visits and AutoPoints stay with you as Mali grows.']].map(([title, detail], index) => <div key={title} className="flex gap-3 p-2"><span className="w-7 h-7 rounded-full bg-brand-100 text-brand-700 grid place-items-center text-xs font-black shrink-0">0{index + 1}</span><div><p className="font-extrabold text-ink-900">{title}</p><p className="text-xs text-ink-500 leading-relaxed mt-1">{detail}</p></div></div>)}
        </div>
      </section>
      <footer className="border-t border-border px-5 py-7 text-center text-xs text-ink-400"><b className="text-ink-600">Mali Holdings</b> · Automotive care, built around one customer.</footer>
    </div>
  );
}
