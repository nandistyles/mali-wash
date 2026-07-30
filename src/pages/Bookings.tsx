import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { CheckCircle2, Clock, Calendar } from 'lucide-react';
import { Button } from '../components/ui/button';
import { sendBookingConfirmation } from '../lib/whatsapp';

export default function Bookings() {
  const bookings = useLiveQuery(() => db.bookings.orderBy('requestedTime').reverse().toArray());

  const handleConfirm = async (id: string, phone: string, name: string, time: number, service: string) => {
    await db.bookings.update(id, { 
      status: 'confirmed',
      syncStatus: 'pending_sync'
    });
    await sendBookingConfirmation(phone, name, new Date(time).toLocaleString(), service.replace('_', ' '));
  };

  const handleComplete = async (id: string) => {
    await db.bookings.update(id, { 
      status: 'done',
      syncStatus: 'pending_sync'
    });
  };

  return (
    <div className="h-full w-full p-6 overflow-auto bg-slate-50 max-w-5xl mx-auto space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Wash Bookings</h1>
          <p className="text-slate-500">Manage online customer requests</p>
        </div>
        <Button variant="outline" asChild>
          <a href="/book" target="_blank" rel="noopener noreferrer">View Public Form</a>
        </Button>
      </div>

      <div className="grid gap-4">
        {bookings?.length === 0 ? (
          <div className="text-center p-12 bg-white rounded-lg border border-slate-200">
            <Calendar className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-lg font-medium text-slate-600">No bookings yet</p>
          </div>
        ) : (
          bookings?.map(booking => (
            <Card key={booking.id} className={`border-l-4 \${
              booking.status === 'pending' ? 'border-l-amber-500' :
              booking.status === 'confirmed' ? 'border-l-teal-500' : 'border-l-slate-300'
            }`}>
              <CardContent className="p-6 flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                <div>
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="font-bold text-lg text-slate-900">{booking.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-bold uppercase tracking-wider \${
                      booking.status === 'pending' ? 'bg-amber-100 text-amber-800' :
                      booking.status === 'confirmed' ? 'bg-teal-100 text-teal-800' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {booking.status}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-1">
                    <p><span className="font-medium text-slate-900">Phone:</span> {booking.phone}</p>
                    <p><span className="font-medium text-slate-900">Vehicle:</span> {booking.vehicle}</p>
                    <p><span className="font-medium text-slate-900">Service:</span> <span className="capitalize">{booking.serviceType.replace('_', ' ')}</span></p>
                    <p className="flex items-center text-teal-700 font-medium">
                      <Clock className="w-4 h-4 mr-1" /> {new Date(booking.requestedTime).toLocaleString()}
                    </p>
                  </div>
                </div>

                <div className="flex gap-2 w-full md:w-auto">
                  {booking.status === 'pending' && (
                    <Button 
                      className="w-full md:w-auto bg-amber-500 hover:bg-amber-600"
                      onClick={() => handleConfirm(booking.id, booking.phone, booking.name, booking.requestedTime, booking.serviceType)}
                    >
                      Confirm (Send WhatsApp)
                    </Button>
                  )}
                  {booking.status === 'confirmed' && (
                    <Button 
                      variant="outline" 
                      className="w-full md:w-auto text-teal-700 border-teal-200 bg-teal-50 hover:bg-teal-100"
                      onClick={() => handleComplete(booking.id)}
                    >
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Mark as Done
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
