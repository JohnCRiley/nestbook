/** Shared badge and label maps used across Bookings, Calendar and the detail panel. */

export const BADGE_CLASS = {
  arriving:                'badge badge-arriving',
  confirmed:               'badge badge-confirmed',
  checked_out:             'badge badge-checked_out',
  cancelled:               'badge badge-cancelled',
  cancelled_unpaid:        'badge badge-cancelled',
  pending_owner_approval:  'badge badge-pending',
  declined:                'badge badge-declined',
};

export const BADGE_LABEL = {
  arriving:                'In House',
  confirmed:               'Confirmed',
  checked_out:             'Checked Out',
  cancelled:               'Cancelled',
  cancelled_unpaid:        'Unpaid',
  pending_owner_approval:  'Pending Approval',
  declined:                'Declined',
};

export const SOURCE_LABELS = {
  direct:      'Direct',
  phone:       'Phone',
  email:       'Email',
  walk_in:     'Walk-in',
  website:     'Website',
  booking_com: 'Booking.com',
  airbnb:      'Airbnb',
  other:       'Other',
};
