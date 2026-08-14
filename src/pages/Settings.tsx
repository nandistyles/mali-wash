import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { AlertTriangle, CheckCircle2, Plus, Save, Trash2 } from 'lucide-react';
import { db, DEFAULT_SETTINGS } from '../lib/db';
import { notifyLocalWrite } from '../lib/sync';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import PageHeader from '../components/PageHeader';
import type { MembershipPlan, Settings as SettingsRecord, WashService } from '../types';

export default function Settings() {
  const stored = useLiveQuery(() => db.settings.get('global'));
  const [draft, setDraft] = useState<SettingsRecord>(DEFAULT_SETTINGS);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { if (stored) setDraft({ ...DEFAULT_SETTINGS, ...stored }); }, [stored]);

  function numeric(field: keyof Pick<SettingsRecord, 'pointsPerDollar'|'pointsPerWash'|'referralRewardPoints'|'redemptionRate'|'minRedeemablePoints'>, value: string) {
    setDraft(current => ({ ...current, [field]: Number(value) }));
  }

  function updateService(index: number, patch: Partial<WashService>) {
    setDraft(current => {
      const service = current.services[index];
      const services = current.services.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row);
      let membershipPlans = current.membershipPlans;
      if (patch.type === 'membership' && !membershipPlans.some(plan => plan.id === service.id)) {
        membershipPlans = [...membershipPlans, { id: service.id, tier: 'basic_member', durationDays: 30, coveredServiceIds: [], washesPerPeriod: 8 }];
      }
      if (patch.type && patch.type !== 'membership') {
        membershipPlans = membershipPlans.filter(plan => plan.id !== service.id);
      }
      return { ...current, services, membershipPlans };
    });
  }

  function addService() {
    setDraft(current => ({ ...current, services: [...current.services, { id: `service_${uuidv4().slice(0,8)}`, name: 'New service', price: 0, type: 'wash' }] }));
  }

  function removeService(index: number) {
    const service = draft.services[index];
    if (draft.membershipPlans.some(plan => plan.id === service.id || plan.coveredServiceIds.includes(service.id))) {
      setError('This service belongs to a membership plan. Update or remove that plan first.');
      return;
    }
    setDraft(current => ({ ...current, services: current.services.filter((_, row) => row !== index) }));
  }

  function updatePlan(index: number, patch: Partial<MembershipPlan>) {
    setDraft(current => ({ ...current, membershipPlans: current.membershipPlans.map((plan, row) => row === index ? { ...plan, ...patch } : plan) }));
  }

  async function save() {
    setError(''); setMessage('');
    try {
      const numericValues = [draft.pointsPerDollar, draft.pointsPerWash, draft.referralRewardPoints, draft.minRedeemablePoints];
      if (numericValues.some(value => !Number.isFinite(value) || value < 0)) throw new Error('Point values must be zero or greater');
      if (!Number.isFinite(draft.redemptionRate) || draft.redemptionRate <= 0) throw new Error('Redemption rate must be greater than zero');
      if (draft.services.some(service => !service.name.trim() || !Number.isFinite(service.price) || service.price < 0)) throw new Error('Every service needs a name and a non-negative price');
      if (draft.membershipPlans.some(plan => plan.durationDays < 1 || plan.washesPerPeriod !== null && plan.washesPerPeriod < 1)) throw new Error('Membership duration and wash limits must be positive');
      await db.settings.put({ ...draft, id: 'global', syncStatus: 'pending_sync' });
      await notifyLocalWrite();
      setMessage('Settings saved and queued for every Mali device.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save settings'); }
  }

  return <div className="mali-page"><div className="mali-page-inner max-w-7xl">
    <PageHeader eyebrow="Control centre" title="Pricing & loyalty settings" description="One governed source for wash pricing, membership benefits and group-wide AutoPoints rules." action={<Button onClick={save}><Save className="h-4 w-4"/>Save all changes</Button>} />
    {error&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="h-5 w-5"/>{error}</div>}
    {message&&<div className="mb-5 flex items-center gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-800"><CheckCircle2 className="h-5 w-5"/>{message}</div>}

    <div className="grid gap-6 xl:grid-cols-[.8fr_1.2fr] items-start">
      <div className="space-y-6">
        <Card><CardHeader><CardTitle>Group AutoPoints rules</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-bold text-ink-700">Points per $1<Input className="mt-2" type="number" min="0" step="1" value={draft.pointsPerDollar} onChange={e=>numeric('pointsPerDollar',e.target.value)}/></label>
          <label className="text-sm font-bold text-ink-700">Bonus per wash<Input className="mt-2" type="number" min="0" step="1" value={draft.pointsPerWash} onChange={e=>numeric('pointsPerWash',e.target.value)}/></label>
          <label className="text-sm font-bold text-ink-700">Referral reward<Input className="mt-2" type="number" min="0" step="1" value={draft.referralRewardPoints} onChange={e=>numeric('referralRewardPoints',e.target.value)}/></label>
          <label className="text-sm font-bold text-ink-700">Points worth $1<Input className="mt-2" type="number" min="1" step="1" value={draft.redemptionRate} onChange={e=>numeric('redemptionRate',e.target.value)}/></label>
          <label className="text-sm font-bold text-ink-700 sm:col-span-2">Minimum points to redeem<Input className="mt-2" type="number" min="0" step="1" value={draft.minRedeemablePoints} onChange={e=>numeric('minRedeemablePoints',e.target.value)}/></label>
        </CardContent></Card>

        <Card><CardHeader><CardTitle>Membership benefits</CardTitle></CardHeader><CardContent className="space-y-4">{draft.membershipPlans.map((plan,index)=><div key={plan.id} className="rounded-xl border border-ink-200 p-4"><p className="font-black">{draft.services.find(service=>service.id===plan.id)?.name??plan.id}</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-xs font-bold text-ink-500">Duration days<Input className="mt-1" type="number" min="1" value={plan.durationDays} onChange={e=>updatePlan(index,{durationDays:Number(e.target.value)})}/></label><label className="text-xs font-bold text-ink-500">Wash cap (blank = unlimited)<Input className="mt-1" type="number" min="1" value={plan.washesPerPeriod??''} onChange={e=>updatePlan(index,{washesPerPeriod:e.target.value===''?null:Number(e.target.value)})}/></label></div><p className="mt-3 text-xs font-bold text-ink-500">Covered services</p><div className="mt-2 flex flex-wrap gap-2">{draft.services.filter(service=>service.type==='wash').map(service=><label key={service.id} className="flex items-center gap-2 rounded-full bg-ink-50 px-3 py-2 text-xs font-bold"><input type="checkbox" checked={plan.coveredServiceIds.includes(service.id)} onChange={e=>updatePlan(index,{coveredServiceIds:e.target.checked?[...plan.coveredServiceIds,service.id]:plan.coveredServiceIds.filter(id=>id!==service.id)})}/>{service.name}</label>)}</div></div>)}</CardContent></Card>
      </div>

      <Card><CardHeader className="flex flex-row items-center justify-between"><CardTitle>Wash services & pricing</CardTitle><Button size="sm" variant="outline" onClick={addService}><Plus className="h-4 w-4"/>Add service</Button></CardHeader><CardContent className="space-y-3">{draft.services.map((service,index)=><div key={service.id} className="rounded-xl border border-ink-200 bg-white p-4"><div className="grid gap-3 sm:grid-cols-[1fr_9rem_9rem_auto] sm:items-end"><label className="text-xs font-bold text-ink-500">Service name<Input className="mt-1" value={service.name} onChange={e=>updateService(index,{name:e.target.value})}/></label><label className="text-xs font-bold text-ink-500">Price USD<Input className="mt-1" type="number" min="0" step="0.01" value={service.price} onChange={e=>updateService(index,{price:Number(e.target.value)})}/></label><label className="text-xs font-bold text-ink-500">Type<select className="mt-1 h-12 w-full rounded-lg border-2 border-ink-200 px-3 text-sm" value={service.type} onChange={e=>updateService(index,{type:e.target.value as WashService['type']})}><option value="wash">Wash</option><option value="membership">Membership</option><option value="fleet">Fleet</option></select></label><Button size="icon" variant="ghost" title="Remove service" onClick={()=>removeService(index)}><Trash2 className="h-4 w-4 text-red-600"/></Button></div></div>)}</CardContent></Card>
    </div>
  </div></div>;
}
