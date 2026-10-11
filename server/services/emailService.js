const { sendMail } = require('../config/mailer');
const config = require('../config/env');

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
}

const baseEmailStyle = `
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  color: #1e293b;
  line-height: 1.6;
  max-width: 600px;
  margin: 0 auto;
  padding: 24px;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  background-color: #ffffff;
`;

const headerStyle = `
  padding-bottom: 20px;
  margin-bottom: 24px;
  border-bottom: 2px solid #06b6d4;
`;

const badgeStyle = `
  display: inline-block;
  padding: 4px 12px;
  border-radius: 9999px;
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
`;

async function sendBookingConfirmation({ booking, user }) {
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${headerStyle}">
        <h2 style="margin: 0; color: #0891b2;">Booking Meeting</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Reservation Confirmation</p>
      </div>

      <p>Dear <strong>${user.fullName}</strong>,</p>
      <p>Your meeting room reservation has been <strong style="color: #059669;">CONFIRMED</strong>. Here are the details of your upcoming meeting:</p>

      <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 140px;"><strong>Meeting Topic:</strong></td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${booking.topic}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Company:</strong></td>
            <td style="padding: 6px 0;">${user.company}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Date:</strong></td>
            <td style="padding: 6px 0; font-weight: 600;">${booking.bookingDate}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Time Slot:</strong></td>
            <td style="padding: 6px 0; font-weight: 600; color: #0891b2;">${booking.startTime} – ${booking.endTime}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Meeting Room:</strong></td>
            <td style="padding: 6px 0;">${escapeHtml(booking.room?.name || '-')}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Status:</strong></td>
            <td style="padding: 6px 0;"><span style="${badgeStyle} background-color: #d1fae5; color: #065f46;">CONFIRMED</span></td>
          </tr>
        </table>
      </div>

      <p style="font-size: 13px; color: #64748b;">
        <strong>Need to reschedule?</strong> Please remember that rescheduling must be submitted at least <strong>1 day before</strong> the meeting date.
      </p>

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        This is an automated notification from Booking Meeting System.
      </div>
    </div>
  `;

  return sendMail({
    to: user.email,
    subject: `[Confirmed] Meeting Room Reservation: ${booking.topic} (${booking.bookingDate})`,
    html,
  });
}

async function sendRescheduleNotification({ booking, user, oldDate, oldStartTime, oldEndTime }) {
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${headerStyle}">
        <h2 style="margin: 0; color: #0891b2;">Booking Meeting</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Reservation Rescheduled</p>
      </div>

      <p>Dear <strong>${user.fullName}</strong>,</p>
      <p>Your meeting room reservation has been successfully <strong style="color: #d97706;">RESCHEDULED</strong>.</p>

      <div style="background-color: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #64748b; width: 140px;"><strong>Meeting Topic:</strong></td>
            <td style="padding: 6px 0; font-weight: 600; color: #0f172a;">${booking.topic}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Previous Time:</strong></td>
            <td style="padding: 6px 0; text-decoration: line-through; color: #94a3b8;">${oldDate} at ${oldStartTime} – ${oldEndTime}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>New Date:</strong></td>
            <td style="padding: 6px 0; font-weight: 600; color: #b45309;">${booking.bookingDate}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>New Time Slot:</strong></td>
            <td style="padding: 6px 0; font-weight: 600; color: #b45309;">${booking.startTime} – ${booking.endTime}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748b;"><strong>Status:</strong></td>
            <td style="padding: 6px 0;"><span style="${badgeStyle} background-color: #fef3c7; color: #92400e;">RESCHEDULED</span></td>
          </tr>
        </table>
      </div>

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        This is an automated notification from Booking Meeting System.
      </div>
    </div>
  `;

  return sendMail({
    to: user.email,
    subject: `[Rescheduled] Meeting Room Reservation: ${booking.topic} (${booking.bookingDate})`,
    html,
  });
}

async function sendConflictNotification({ requestedDate, requestedStartTime, requestedEndTime, topic, user, conflictingBooking }) {
  const html = `
    <div style="${baseEmailStyle}">
      <div style="${headerStyle}">
        <h2 style="margin: 0; color: #e11d48;">Booking Meeting</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Schedule Conflict Notice</p>
      </div>

      <p>Dear <strong>${user.fullName}</strong>,</p>
      <p>We could not complete your meeting room reservation request because the requested time slot is <strong style="color: #e11d48;">UNAVAILABLE</strong>.</p>

      <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 20px 0;">
        <p style="margin: 0 0 8px 0; font-weight: 600; color: #991b1b;">Requested Booking Details:</p>
        <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #475569;">
          <li>Topic: <strong>${topic || 'Meeting'}</strong></li>
          <li>Date: <strong>${requestedDate}</strong></li>
          <li>Requested Time: <strong>${requestedStartTime} – ${requestedEndTime}</strong></li>
        </ul>

        <div style="margin-top: 12px; padding-top: 12px; border-top: 1px dashed #fca5a5; font-size: 13px; color: #7f1d1d;">
          <em>Conflict reason: The room is already occupied during this time range${conflictingBooking ? ` (${conflictingBooking.startTime} – ${conflictingBooking.endTime})` : ''}.</em>
        </div>
      </div>

      <p style="font-size: 14px;">Please sign in to the <strong>Booking Meeting</strong> dashboard to select an alternative available time slot.</p>

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        This is an automated notification from Booking Meeting System.
      </div>
    </div>
  `;

  return sendMail({
    to: user.email,
    subject: `[Conflict] Meeting Room Unavailable for ${requestedDate} (${requestedStartTime} – ${requestedEndTime})`,
    html,
  });
}

async function sendPasswordResetEmail({ user, resetToken }) {
  const resetUrl = `${config.APP_URL}/?resetToken=${resetToken}#reset-password`;

  const html = `
    <div style="${baseEmailStyle}">
      <div style="${headerStyle}">
        <h2 style="margin: 0; color: #0891b2;">Booking Meeting</h2>
        <p style="margin: 4px 0 0 0; color: #64748b; font-size: 14px;">Password Reset Request</p>
      </div>

      <p>Hello <strong>${user.fullName}</strong>,</p>
      <p>We received a request to reset the password for your account.</p>
      <p>Click the button below to set a new password. This link is valid for <strong>1 hour</strong> and can only be used once.</p>

      <div style="text-align: center; margin: 28px 0;">
        <a href="${resetUrl}" style="background: linear-gradient(135deg, #06b6d4, #8b5cf6); color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; display: inline-block;">
          Reset Password
        </a>
      </div>

      <p style="font-size: 13px; color: #64748b;">
        Or copy and paste this link in your browser:<br>
        <span style="color: #0891b2; word-break: break-all;">${resetUrl}</span>
      </p>

      <p style="font-size: 13px; color: #94a3b8; margin-top: 24px;">
        If you did not request a password reset, please ignore this email. Your password will remain unchanged.
      </p>

      <div style="margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; text-align: center;">
        This is an automated notification from Booking Meeting System.
      </div>
    </div>
  `;

  return sendMail({
    to: user.email,
    subject: `[Booking Meeting] Password Reset Request`,
    html,
  });
}

module.exports = {
  sendBookingConfirmation,
  sendRescheduleNotification,
  sendConflictNotification,
  sendPasswordResetEmail,
};
