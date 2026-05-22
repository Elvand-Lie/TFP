import { Resend } from 'resend';

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { email, name, chartData, pdfBase64 } = req.body;

    if (!email || !chartData) {
      return res.status(400).json({ error: 'Email and chartData are required' });
    }

    // Extract key information from the BaZi chart data
    const dm = chartData.four_pillars?.day_pillar?.heavenly_stem?.character || 'Unknown';
    const dmName = chartData.four_pillars?.day_pillar?.heavenly_stem?.name || 'Unknown';
    const strength = chartData.analysis?.dm_strength_label || 'Balanced';
    const structure = chartData.analysis?.main_structure || 'Unknown';

    // Build the HTML email content
    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1C1C1E;">
        <div style="text-align: center; margin-bottom: 20px;">
          <h2 style="color: #710101;">The Full Picture</h2>
          <p style="font-size: 1.2rem;">Your Full BaZi Destiny Report</p>
        </div>
        
        <p>Hello ${name || 'there'},</p>
        <p>Thank you for using our BaZi Calculator. <strong>Please find your complete, highly detailed BaZi Destiny Report attached as a PDF to this email.</strong></p>
        <p>Here is a brief summary of your core identity (Day Master) and Chart Structure:</p>
        
        <div style="background-color: #F5F5F2; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #C6A96B; text-transform: uppercase; font-size: 0.9rem; letter-spacing: 1px;">Day Master</h3>
          <p style="font-size: 2rem; margin: 10px 0; font-weight: bold;">${dm} <span style="font-size: 1.2rem; font-weight: normal; color: #888580;">(${dmName})</span></p>
          <p><strong>Strength:</strong> ${strength}</p>
          <p><strong>Main Structure:</strong> ${structure}</p>
        </div>

        <p>If you're ready to dive deeper and decode your potential, career paths, and wealth capacity, we invite you to book a 1-on-1 session.</p>

        <div style="margin-top: 30px; text-align: center;">
          <a href="https://thefullpicture.vercel.app/contact" style="display: inline-block; background-color: #710101; color: #FFFFFF; padding: 12px 24px; text-decoration: none; border-radius: 4px; font-weight: bold;">Book a Full Consultation</a>
        </div>
        
        <p style="margin-top: 40px; font-size: 0.8rem; color: #888580; text-align: center;">
          © ${new Date().getFullYear()} The Full Picture LLP. All rights reserved.
        </p>
      </div>
    `;

    // Prepare attachments array if PDF is provided
    const attachments = pdfBase64 ? [
      {
        filename: 'Your_BaZi_Report.pdf',
        content: pdfBase64,
      }
    ] : [];

    // Send the email via Resend
    // IMPORTANT: Because the domain is not yet verified, we are temporarily using Sandbox Mode.
    // The 'from' address MUST be 'onboarding@resend.dev', and the 'to' address MUST be your Resend account email.
    const { data, error } = await resend.emails.send({
      from: 'The Full Picture <onboarding@resend.dev>', 
      to: [email],
      subject: 'Your Full BaZi Report - The Full Picture',
      html: htmlContent,
      attachments: attachments,
    });

    if (error) {
      console.error('Resend API Error:', error);
      return res.status(400).json({ error: error.message || 'Failed to send email' });
    }

    // Optional: Add to Resend Audience/Contacts if you have an Audience ID setup
    // await resend.contacts.create({
    //   email: email,
    //   firstName: name,
    //   audienceId: 'YOUR_AUDIENCE_ID'
    // });

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error('Error sending email:', error);
    return res.status(500).json({ error: 'Failed to send email' });
  }
}
