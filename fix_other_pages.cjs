const fs = require('fs');
let customers = fs.readFileSync('src/pages/Customers.tsx', 'utf8');
customers = customers.replace(/c\.vehicleReg \|\| c\.vehicles\?\.\[0\]\?\.makeModel/g, "c.vehicles?.[0]?.reg || c.vehicles?.[0]?.makeModel");
fs.writeFileSync('src/pages/Customers.tsx', customers);

let pos = fs.readFileSync('src/pages/POS.tsx', 'utf8');
pos = pos.replace(/newCustomer\.vehicles\?\.\[0\]\?\.makeModel \|\| ''/g, "newCustomer.vehicleMakeModel");
fs.writeFileSync('src/pages/POS.tsx', pos);

let bookings = fs.readFileSync('src/pages/Bookings.tsx', 'utf8');
bookings = bookings.replace(/b\.time/g, "b.requestedTime");
bookings = bookings.replace(/b\.service/g, "b.serviceType");
bookings = bookings.replace(/b\.customerName/g, "b.name");
bookings = bookings.replace(/b\.customerPhone/g, "b.phone");
fs.writeFileSync('src/pages/Bookings.tsx', bookings);

let publicBooking = fs.readFileSync('src/pages/PublicBooking.tsx', 'utf8');
publicBooking = publicBooking.replace(/customerName: form\.name/g, "name: form.name");
publicBooking = publicBooking.replace(/customerPhone: form\.phone/g, "phone: form.phone");
publicBooking = publicBooking.replace(/service: form\.service/g, "serviceType: form.service");
publicBooking = publicBooking.replace(/time:/g, "requestedTime:");
fs.writeFileSync('src/pages/PublicBooking.tsx', publicBooking);

let shifts = fs.readFileSync('src/pages/Shifts.tsx', 'utf8');
shifts = shifts.replace(/shift\.startTime/g, "shift.openedAt");
shifts = shifts.replace(/shift\.endTime/g, "shift.closedAt");
fs.writeFileSync('src/pages/Shifts.tsx', shifts);

