import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CheckCircle2, Clock, Calendar } from 'lucide-react';
import { Button } from '../components/ui/button';
import { bookingConfirmationText, openWhatsApp } from '../lib/whatsapp';
import { notifyLocalWrite } from '../lib/sync';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageCircle } from 'lucide-react';
import PageHeader from '../components/PageHeader';
import EmptyState from '../components/EmptyState';

export default function Bookings() {
  const bookings = useLiveQuery(() => db.bookings.orderBy('requestedTime').reverse().toArray());

  const handleConfirm = async (id: string, phone: string, name: string, time: number, service: string) => {
    // Open from the click itself so mobile browsers do not block WhatsApp as a
    // popup after the asynchronous database write.
    openWhatsApp(phone, bookingConfirmationText(name, new Date(time).toLocaleString(), service.replaceAll('_', ' ')));
    await db.bookings.update(id, { 
      status: 'confirmed',
      syncStatus: 'pending_sync'
    });
    void notifyLocalWrite();
  };

  const handleComplete = async (id: string) => {
    await db.bookings.update(id, { 
      status: 'done',
      syncStatus: 'pending_sync'
    });
    void notifyLocalWrite();
  };

  return (
    <div className="mali-page">
      <div className="mali-page-inner max-w-6xl">
      <PageHeader eyebrow="Customer experience" title="Wash bookings" description="Turn online interest into confirmed visits without losing the human touch." action={
        <Button variant="outline" asChild>
          <a href="/book" target="_blank" rel="noopener noreferrer">View public page <ArrowRight className="w-4 h-4" /></a>
        </Button>
      } />

      <div className="grid gap-4">
        {bookings?.length === 0 ? (
          <EmptyState icon={Calendar} title="The booking queue is clear" description="New requests from the public booking page will appear here, ready to confirm on WhatsApp." action={<Button variant="outline" asChild><a href="/book" target="_blank" rel="noopener noreferrer">Preview booking page</a></Button>} />
        ) : (
          bookings?.map(booking => (
            <Card key={booking.id} className={`border-l-4 ${
              booking.status === 'pending' ? 'border-l-accent-500' :
              booking.status === 'confirmed' ? 'border-l-brand-500' : 'border-l-ink-300'
            }`}>
              <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg text-ink-900">{booking.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider ${
                      booking.status === 'pending' ? 'bg-accent-100 text-accent-800' :
                      booking.status === 'confirmed' ? 'bg-brand-100 text-brand-800' : 'bg-ink-100 text-ink-600'
                    }`}>
                      {booking.status}
                    </span>
                  </div>
                  <div className="text-sm text-ink-600 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                    <p><span className="font-medium text-ink-900">Phone:</span> {booking.phone}</p>
                    <p><span className="font-medium text-ink-900">Vehicle:</span> {booking.vehicle}</p>
                    <p><span className="font-medium text-ink-900">Service:</span> <span className="capitalize">{booking.serviceType.replace('_', ' ')}</span></p>
                    <p className="flex items-center text-brand-700 font-medium">
                      <Clock className="w-4 h-4 mr-1" /> {new Date(booking.requestedTime).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                  {booking.status === 'pending' && (
                    <Button 
                      className="w-full md:w-auto bg-accent-500 hover:bg-accent-600"
                      onClick={() => handleConfirm(booking.id, booking.phone, booking.name, booking.requestedTime, booking.serviceType)}
                    >
                      <MessageCircle className="w-4 h-4 mr-2" /> Confirm & message
                    </Button>
                  )}
                  {booking.status === 'confirmed' && (
                    <>
                      <Button variant="outline" asChild className="w-full md:w-auto">
                        <Link to={`/pos?booking=${encodeURIComponent(booking.id)}`}>
                          Check in <ArrowRight className="w-4 h-4 ml-2" />
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        className="w-full md:w-auto text-brand-700 border-brand-200 bg-brand-50 hover:bg-brand-100"
                        onClick={() => handleComplete(booking.id)}
                      >
                        <CheckCircle2 className="w-4 h-4 mr-2" /> Done without sale
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
      </div>
    </div>
  );
}
