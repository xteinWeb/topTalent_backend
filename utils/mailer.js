const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || '465', 10),
  secure: parseInt(process.env.SMTP_PORT || '465', 10) === 465, // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    // do not fail on invalid certs
    rejectUnauthorized: false
  }
});

exports.sendVerificationEmail = async (to, code) => {
  const mailOptions = {
    from: `"Artdecon Soporte" <${process.env.SMTP_USER}>`,
    to: to,
    subject: 'Código de verificación de tu cuenta - Artdecon Portal de Empleo',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #16313a; margin: 0;">Portal de Empleo Artdecon</h2>
        </div>
        <p style="font-size: 16px; color: #4a5568;">Hola,</p>
        <p style="font-size: 16px; color: #4a5568;">Gracias por registrarte. Para completar tu registro y activar tu cuenta de candidato, por favor ingresa el siguiente código de verificación de 6 dígitos:</p>
        <div style="text-align: center; margin: 30px 0;">
          <span style="font-size: 32px; font-weight: bold; color: #b39c70; letter-spacing: 5px; border: 2px dashed #b39c70; padding: 10px 20px; border-radius: 4px; background-color: #f7fafc;">
            ${code}
          </span>
        </div>
        <p style="font-size: 14px; color: #718096;">Este código es de un solo uso y es necesario para activar tu perfil de postulación.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0;">
        <p style="font-size: 12px; color: #a0aec0; text-align: center;">Este es un mensaje automático, por favor no respondas a este correo.</p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};

exports.sendInterviewInvitationEmail = async (to, candidateName, vacancyTitle, interviewData, calendarLink) => {
  const { fecha, hora, modalidad, ubicacion_o_enlace, entrevistador, notas } = interviewData;

  const mailOptions = {
    from: `"Talento Humano Artdecon" <${process.env.SMTP_USER}>`,
    to: to,
    subject: `Citación a Entrevista - Vacante: ${vacancyTitle} | Artdecon`,
    html: `
      <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 620px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #2d3748;">
        <div style="text-align: center; margin-bottom: 25px; border-bottom: 2px solid #b39c70; padding-bottom: 15px;">
          <h2 style="color: #16313a; margin: 0; font-size: 22px;">Artdecon Talent Acquisition</h2>
          <p style="color: #718096; margin: 5px 0 0; font-size: 14px;">Notificación Oficial de Selección</p>
        </div>

        <p style="font-size: 16px;">Estimado(a) <strong>${candidateName || 'Candidato(a)'}</strong>,</p>

        <p style="font-size: 15px; line-height: 1.6;">
          Nos complace informarle que tras la revisión de su perfil profesional para la vacante <strong>${vacancyTitle}</strong>, ha sido preseleccionado(a) y nos gustaría invitarle a una entrevista laboral.
        </p>

        <div style="background-color: #f8fafc; border-left: 4px solid #b39c70; padding: 18px; margin: 20px 0; border-radius: 6px;">
          <h4 style="margin: 0 0 12px; color: #16313a; font-size: 16px;">Detalles de la Cita:</h4>
          <p style="margin: 6px 0; font-size: 14px;"><strong>📅 Fecha:</strong> ${fecha}</p>
          <p style="margin: 6px 0; font-size: 14px;"><strong>⏰ Hora:</strong> ${hora}</p>
          <p style="margin: 6px 0; font-size: 14px;"><strong>📍 Modalidad:</strong> ${modalidad || 'Presencial'}</p>
          ${ubicacion_o_enlace ? `<p style="margin: 6px 0; font-size: 14px;"><strong>📌 Lugar / Enlace:</strong> ${ubicacion_o_enlace}</p>` : ''}
          ${entrevistador ? `<p style="margin: 6px 0; font-size: 14px;"><strong>👤 Entrevistador(a):</strong> ${entrevistador}</p>` : ''}
          ${notas ? `<p style="margin: 6px 0; font-size: 14px;"><strong>📝 Indicaciones:</strong> ${notas}</p>` : ''}
        </div>

        ${calendarLink ? `
        <div style="text-align: center; margin: 25px 0;">
          <a href="${calendarLink}" target="_blank" style="background-color: #16313a; color: #ffffff; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; display: inline-block; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
            📅 Agregar a Google Calendar
          </a>
        </div>
        ` : ''}

        <p style="font-size: 13px; color: #718096; line-height: 1.5;">
          Por favor confirme su asistencia respondiendo a este mensaje o a través del canal oficial de WhatsApp de Talento Humano.
        </p>

        <hr style="border: 0; border-top: 1px solid #edf2f7; margin: 25px 0;">
        <p style="font-size: 12px; color: #a0aec0; text-align: center;">
          Artdecon S.A.S. - Departamento de Gestión y Talento Humano
        </p>
      </div>
    `
  };

  return transporter.sendMail(mailOptions);
};
