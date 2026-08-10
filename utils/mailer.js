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
