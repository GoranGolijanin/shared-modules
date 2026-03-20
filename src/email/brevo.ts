import * as Brevo from '@getbrevo/brevo';
import dotenv from 'dotenv';

// Load .env from shared-modules root (works when run from project root)
dotenv.config();

const apiInstance = new Brevo.TransactionalEmailsApi();
apiInstance.setApiKey(
  Brevo.TransactionalEmailsApiApiKeys.apiKey,
  process.env.BREVO_API_KEY || ''
);

export interface EmailOptions {
  to: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const sendSmtpEmail = new Brevo.SendSmtpEmail();

  sendSmtpEmail.subject = options.subject;
  sendSmtpEmail.htmlContent = options.htmlContent;
  sendSmtpEmail.textContent = options.textContent;
  sendSmtpEmail.sender = {
    name: process.env.EMAIL_FROM_NAME || 'App',
    email: process.env.EMAIL_FROM_ADDRESS || 'noreply@example.com',
  };
  sendSmtpEmail.to = [{ email: options.to }];

  try {
    await apiInstance.sendTransacEmail(sendSmtpEmail);
    return true;
  } catch (error) {
    console.error('Failed to send email:', error);
    return false;
  }
}

// ============================================
// Email Translation System
// ============================================

type SupportedLocale = 'en' | 'es' | 'fr' | 'zh' | 'hi' | 'ar' | 'bn' | 'pt' | 'ru' | 'ja' | 'de';

const emailTranslations: Record<SupportedLocale, Record<string, string>> = {
  en: {
    'verify.subject': 'Verify your email address',
    'verify.title': 'Verify Your Email',
    'verify.body': 'Thank you for registering! Please click the button below to verify your email address:',
    'verify.button': 'Verify Email',
    'verify.linkText': 'Or copy and paste this link in your browser:',
    'verify.footer': "This link will expire in 24 hours. If you didn't create an account, you can safely ignore this email.",
    'verify.textOnly': 'Verify your email by visiting:',
    'reset.subject': 'Reset your password',
    'reset.title': 'Reset Your Password',
    'reset.body': 'You requested to reset your password. Click the button below to create a new password:',
    'reset.button': 'Reset Password',
    'reset.linkText': 'Or copy and paste this link in your browser:',
    'reset.footer': "This link will expire in 1 hour. If you didn't request a password reset, you can safely ignore this email.",
    'reset.textOnly': 'Reset your password by visiting:',
    'ssl.subject': 'SSL Certificate Expiry Alert: {domain}',
    'ssl.title': 'SSL Certificate Expiry Alert',
    'ssl.urgentTomorrow': 'URGENT: Your SSL certificate expires tomorrow!',
    'ssl.warningDays': 'Warning: Your SSL certificate expires in {days} days',
    'ssl.reminderDays': 'Reminder: Your SSL certificate expires in {days} days',
    'ssl.domain': 'Domain:',
    'ssl.expiryDate': 'Expiry Date:',
    'ssl.daysRemaining': 'Days Remaining:',
    'ssl.action': 'To avoid service disruptions and security warnings for your visitors, please renew your SSL certificate before the expiry date.',
    'ssl.button': 'View Dashboard',
    'ssl.footer': "You're receiving this email because you have SSL monitoring enabled for {domain}. To change your notification settings, visit your dashboard.",
    'ssl.textAction': 'Please renew your SSL certificate before the expiry date.',
    'domain.subject': 'Domain Expiry Alert: {domain}',
    'domain.title': 'Domain Expiry Alert',
    'domain.urgentTomorrow': 'URGENT: Your domain expires tomorrow!',
    'domain.warningDays': 'Warning: Your domain expires in {days} days',
    'domain.reminderDays': 'Reminder: Your domain expires in {days} days',
    'domain.action': 'If your domain expires and is not renewed, you may lose ownership of it permanently. Someone else could register it, affecting your online presence and brand.',
    'domain.button': 'View Dashboard',
    'domain.footer': "You're receiving this email because you have domain monitoring enabled for {domain}. To change your notification settings, visit your dashboard.",
    'domain.textAction': 'IMPORTANT: If your domain expires and is not renewed, you may lose ownership of it permanently.',
    'renewal.subject': '{type} Renewed: {domain}',
    'renewal.title': '{type} Renewed',
    'renewal.body': 'Great news! Your {type} has been renewed.',
    'renewal.domain': 'Domain:',
    'renewal.previousExpiry': 'Previous Expiry:',
    'renewal.newExpiry': 'New Expiry:',
    'renewal.extendedBy': 'Extended By:',
    'renewal.daysUnit': '{days} days',
    'renewal.resetNotice': "Your notification cycle has been reset for the new expiry date. You'll receive expiry reminders based on your notification preferences.",
    'renewal.button': 'View Dashboard',
    'renewal.footer': "You're receiving this email because you have renewal notifications enabled for {domain}. To change your notification settings, visit your dashboard.",
    'common.important': 'Important:',
  },
  fr: {
    'verify.subject': 'Vérifiez votre adresse e-mail',
    'verify.title': 'Vérifiez votre e-mail',
    'verify.body': "Merci de vous être inscrit ! Veuillez cliquer sur le bouton ci-dessous pour vérifier votre adresse e-mail :",
    'verify.button': "Vérifier l'e-mail",
    'verify.linkText': 'Ou copiez et collez ce lien dans votre navigateur :',
    'verify.footer': "Ce lien expirera dans 24 heures. Si vous n'avez pas créé de compte, vous pouvez ignorer cet e-mail.",
    'verify.textOnly': 'Vérifiez votre e-mail en visitant :',
    'reset.subject': 'Réinitialisez votre mot de passe',
    'reset.title': 'Réinitialisez votre mot de passe',
    'reset.body': 'Vous avez demandé la réinitialisation de votre mot de passe. Cliquez sur le bouton ci-dessous pour créer un nouveau mot de passe :',
    'reset.button': 'Réinitialiser le mot de passe',
    'reset.linkText': 'Ou copiez et collez ce lien dans votre navigateur :',
    'reset.footer': "Ce lien expirera dans 1 heure. Si vous n'avez pas demandé de réinitialisation, vous pouvez ignorer cet e-mail.",
    'reset.textOnly': 'Réinitialisez votre mot de passe en visitant :',
    'ssl.subject': 'Alerte d\'expiration du certificat SSL : {domain}',
    'ssl.title': 'Alerte d\'expiration du certificat SSL',
    'ssl.urgentTomorrow': 'URGENT : Votre certificat SSL expire demain !',
    'ssl.warningDays': 'Attention : Votre certificat SSL expire dans {days} jours',
    'ssl.reminderDays': 'Rappel : Votre certificat SSL expire dans {days} jours',
    'ssl.domain': 'Domaine :',
    'ssl.expiryDate': "Date d'expiration :",
    'ssl.daysRemaining': 'Jours restants :',
    'ssl.action': "Pour éviter les interruptions de service et les avertissements de sécurité pour vos visiteurs, veuillez renouveler votre certificat SSL avant la date d'expiration.",
    'ssl.button': 'Voir le tableau de bord',
    'ssl.footer': 'Vous recevez cet e-mail car vous avez activé la surveillance SSL pour {domain}. Pour modifier vos paramètres de notification, visitez votre tableau de bord.',
    'ssl.textAction': "Veuillez renouveler votre certificat SSL avant la date d'expiration.",
    'domain.subject': "Alerte d'expiration du domaine : {domain}",
    'domain.title': "Alerte d'expiration du domaine",
    'domain.urgentTomorrow': 'URGENT : Votre domaine expire demain !',
    'domain.warningDays': 'Attention : Votre domaine expire dans {days} jours',
    'domain.reminderDays': 'Rappel : Votre domaine expire dans {days} jours',
    'domain.action': "Si votre domaine expire et n'est pas renouvelé, vous pourriez en perdre la propriété définitivement. Quelqu'un d'autre pourrait l'enregistrer, affectant votre présence en ligne et votre marque.",
    'domain.button': 'Voir le tableau de bord',
    'domain.footer': 'Vous recevez cet e-mail car vous avez activé la surveillance de domaine pour {domain}. Pour modifier vos paramètres de notification, visitez votre tableau de bord.',
    'domain.textAction': "IMPORTANT : Si votre domaine expire et n'est pas renouvelé, vous pourriez en perdre la propriété définitivement.",
    'renewal.subject': '{type} renouvelé : {domain}',
    'renewal.title': '{type} renouvelé',
    'renewal.body': 'Bonne nouvelle ! Votre {type} a été renouvelé.',
    'renewal.domain': 'Domaine :',
    'renewal.previousExpiry': 'Expiration précédente :',
    'renewal.newExpiry': 'Nouvelle expiration :',
    'renewal.extendedBy': 'Prolongé de :',
    'renewal.daysUnit': '{days} jours',
    'renewal.resetNotice': "Votre cycle de notification a été réinitialisé pour la nouvelle date d'expiration. Vous recevrez des rappels d'expiration selon vos préférences de notification.",
    'renewal.button': 'Voir le tableau de bord',
    'renewal.footer': 'Vous recevez cet e-mail car vous avez activé les notifications de renouvellement pour {domain}. Pour modifier vos paramètres, visitez votre tableau de bord.',
    'common.important': 'Important :',
  },
  es: {
    'verify.subject': 'Verifica tu dirección de correo electrónico',
    'verify.title': 'Verifica tu correo electrónico',
    'verify.body': '¡Gracias por registrarte! Haz clic en el botón de abajo para verificar tu dirección de correo electrónico:',
    'verify.button': 'Verificar correo',
    'verify.linkText': 'O copia y pega este enlace en tu navegador:',
    'verify.footer': 'Este enlace caducará en 24 horas. Si no creaste una cuenta, puedes ignorar este correo.',
    'verify.textOnly': 'Verifica tu correo visitando:',
    'reset.subject': 'Restablece tu contraseña',
    'reset.title': 'Restablece tu contraseña',
    'reset.body': 'Solicitaste restablecer tu contraseña. Haz clic en el botón de abajo para crear una nueva contraseña:',
    'reset.button': 'Restablecer contraseña',
    'reset.linkText': 'O copia y pega este enlace en tu navegador:',
    'reset.footer': 'Este enlace caducará en 1 hora. Si no solicitaste un restablecimiento de contraseña, puedes ignorar este correo.',
    'reset.textOnly': 'Restablece tu contraseña visitando:',
    'ssl.subject': 'Alerta de expiración del certificado SSL: {domain}',
    'ssl.title': 'Alerta de expiración del certificado SSL',
    'ssl.urgentTomorrow': '¡URGENTE: Tu certificado SSL expira mañana!',
    'ssl.warningDays': 'Advertencia: Tu certificado SSL expira en {days} días',
    'ssl.reminderDays': 'Recordatorio: Tu certificado SSL expira en {days} días',
    'ssl.domain': 'Dominio:',
    'ssl.expiryDate': 'Fecha de expiración:',
    'ssl.daysRemaining': 'Días restantes:',
    'ssl.action': 'Para evitar interrupciones del servicio y advertencias de seguridad para sus visitantes, renueve su certificado SSL antes de la fecha de vencimiento.',
    'ssl.button': 'Ver panel de control',
    'ssl.footer': 'Recibes este correo porque tienes activada la monitorización SSL para {domain}. Para cambiar tus ajustes de notificación, visita tu panel de control.',
    'ssl.textAction': 'Por favor, renueva tu certificado SSL antes de la fecha de vencimiento.',
    'domain.subject': 'Alerta de expiración del dominio: {domain}',
    'domain.title': 'Alerta de expiración del dominio',
    'domain.urgentTomorrow': '¡URGENTE: Tu dominio expira mañana!',
    'domain.warningDays': 'Advertencia: Tu dominio expira en {days} días',
    'domain.reminderDays': 'Recordatorio: Tu dominio expira en {days} días',
    'domain.action': 'Si tu dominio expira y no se renueva, podrías perder la propiedad de forma permanente. Alguien más podría registrarlo, afectando tu presencia en línea y tu marca.',
    'domain.button': 'Ver panel de control',
    'domain.footer': 'Recibes este correo porque tienes activada la monitorización de dominio para {domain}. Para cambiar tus ajustes de notificación, visita tu panel de control.',
    'domain.textAction': 'IMPORTANTE: Si tu dominio expira y no se renueva, podrías perder la propiedad de forma permanente.',
    'renewal.subject': '{type} renovado: {domain}',
    'renewal.title': '{type} renovado',
    'renewal.body': '¡Buenas noticias! Tu {type} ha sido renovado.',
    'renewal.domain': 'Dominio:',
    'renewal.previousExpiry': 'Expiración anterior:',
    'renewal.newExpiry': 'Nueva expiración:',
    'renewal.extendedBy': 'Extendido por:',
    'renewal.daysUnit': '{days} días',
    'renewal.resetNotice': 'Tu ciclo de notificación ha sido reiniciado para la nueva fecha de vencimiento. Recibirás recordatorios según tus preferencias.',
    'renewal.button': 'Ver panel de control',
    'renewal.footer': 'Recibes este correo porque tienes activadas las notificaciones de renovación para {domain}. Para cambiar tus ajustes, visita tu panel de control.',
    'common.important': 'Importante:',
  },
  de: {
    'verify.subject': 'Bestätigen Sie Ihre E-Mail-Adresse',
    'verify.title': 'E-Mail bestätigen',
    'verify.body': 'Vielen Dank für Ihre Registrierung! Bitte klicken Sie auf die Schaltfläche unten, um Ihre E-Mail-Adresse zu bestätigen:',
    'verify.button': 'E-Mail bestätigen',
    'verify.linkText': 'Oder kopieren Sie diesen Link in Ihren Browser:',
    'verify.footer': 'Dieser Link läuft in 24 Stunden ab. Wenn Sie kein Konto erstellt haben, können Sie diese E-Mail ignorieren.',
    'verify.textOnly': 'Bestätigen Sie Ihre E-Mail unter:',
    'reset.subject': 'Passwort zurücksetzen',
    'reset.title': 'Passwort zurücksetzen',
    'reset.body': 'Sie haben das Zurücksetzen Ihres Passworts angefordert. Klicken Sie auf die Schaltfläche unten, um ein neues Passwort zu erstellen:',
    'reset.button': 'Passwort zurücksetzen',
    'reset.linkText': 'Oder kopieren Sie diesen Link in Ihren Browser:',
    'reset.footer': 'Dieser Link läuft in 1 Stunde ab. Wenn Sie kein Zurücksetzen angefordert haben, können Sie diese E-Mail ignorieren.',
    'reset.textOnly': 'Setzen Sie Ihr Passwort zurück unter:',
    'ssl.subject': 'SSL-Zertifikat-Ablaufwarnung: {domain}',
    'ssl.title': 'SSL-Zertifikat-Ablaufwarnung',
    'ssl.urgentTomorrow': 'DRINGEND: Ihr SSL-Zertifikat läuft morgen ab!',
    'ssl.warningDays': 'Warnung: Ihr SSL-Zertifikat läuft in {days} Tagen ab',
    'ssl.reminderDays': 'Erinnerung: Ihr SSL-Zertifikat läuft in {days} Tagen ab',
    'ssl.domain': 'Domain:',
    'ssl.expiryDate': 'Ablaufdatum:',
    'ssl.daysRemaining': 'Verbleibende Tage:',
    'ssl.action': 'Um Dienstunterbrechungen und Sicherheitswarnungen für Ihre Besucher zu vermeiden, erneuern Sie bitte Ihr SSL-Zertifikat vor dem Ablaufdatum.',
    'ssl.button': 'Dashboard anzeigen',
    'ssl.footer': 'Sie erhalten diese E-Mail, weil Sie die SSL-Überwachung für {domain} aktiviert haben. Um Ihre Benachrichtigungseinstellungen zu ändern, besuchen Sie Ihr Dashboard.',
    'ssl.textAction': 'Bitte erneuern Sie Ihr SSL-Zertifikat vor dem Ablaufdatum.',
    'domain.subject': 'Domain-Ablaufwarnung: {domain}',
    'domain.title': 'Domain-Ablaufwarnung',
    'domain.urgentTomorrow': 'DRINGEND: Ihre Domain läuft morgen ab!',
    'domain.warningDays': 'Warnung: Ihre Domain läuft in {days} Tagen ab',
    'domain.reminderDays': 'Erinnerung: Ihre Domain läuft in {days} Tagen ab',
    'domain.action': 'Wenn Ihre Domain abläuft und nicht erneuert wird, könnten Sie das Eigentum dauerhaft verlieren. Jemand anderes könnte sie registrieren.',
    'domain.button': 'Dashboard anzeigen',
    'domain.footer': 'Sie erhalten diese E-Mail, weil Sie die Domain-Überwachung für {domain} aktiviert haben. Um Ihre Einstellungen zu ändern, besuchen Sie Ihr Dashboard.',
    'domain.textAction': 'WICHTIG: Wenn Ihre Domain abläuft und nicht erneuert wird, könnten Sie das Eigentum dauerhaft verlieren.',
    'renewal.subject': '{type} erneuert: {domain}',
    'renewal.title': '{type} erneuert',
    'renewal.body': 'Gute Nachrichten! Ihr {type} wurde erneuert.',
    'renewal.domain': 'Domain:',
    'renewal.previousExpiry': 'Vorheriges Ablaufdatum:',
    'renewal.newExpiry': 'Neues Ablaufdatum:',
    'renewal.extendedBy': 'Verlängert um:',
    'renewal.daysUnit': '{days} Tage',
    'renewal.resetNotice': 'Ihr Benachrichtigungszyklus wurde für das neue Ablaufdatum zurückgesetzt.',
    'renewal.button': 'Dashboard anzeigen',
    'renewal.footer': 'Sie erhalten diese E-Mail, weil Sie Erneuerungsbenachrichtigungen für {domain} aktiviert haben.',
    'common.important': 'Wichtig:',
  },
  pt: {
    'verify.subject': 'Verifique seu endereço de e-mail',
    'verify.title': 'Verifique seu e-mail',
    'verify.body': 'Obrigado por se registrar! Clique no botão abaixo para verificar seu endereço de e-mail:',
    'verify.button': 'Verificar e-mail',
    'verify.linkText': 'Ou copie e cole este link no seu navegador:',
    'verify.footer': 'Este link expira em 24 horas. Se você não criou uma conta, pode ignorar este e-mail.',
    'verify.textOnly': 'Verifique seu e-mail visitando:',
    'reset.subject': 'Redefinir sua senha',
    'reset.title': 'Redefinir sua senha',
    'reset.body': 'Você solicitou a redefinição da sua senha. Clique no botão abaixo para criar uma nova senha:',
    'reset.button': 'Redefinir senha',
    'reset.linkText': 'Ou copie e cole este link no seu navegador:',
    'reset.footer': 'Este link expira em 1 hora. Se você não solicitou a redefinição, pode ignorar este e-mail.',
    'reset.textOnly': 'Redefina sua senha visitando:',
    'ssl.subject': 'Alerta de expiração do certificado SSL: {domain}',
    'ssl.title': 'Alerta de expiração do certificado SSL',
    'ssl.urgentTomorrow': 'URGENTE: Seu certificado SSL expira amanhã!',
    'ssl.warningDays': 'Aviso: Seu certificado SSL expira em {days} dias',
    'ssl.reminderDays': 'Lembrete: Seu certificado SSL expira em {days} dias',
    'ssl.domain': 'Domínio:',
    'ssl.expiryDate': 'Data de expiração:',
    'ssl.daysRemaining': 'Dias restantes:',
    'ssl.action': 'Para evitar interrupções no serviço, renove seu certificado SSL antes da data de vencimento.',
    'ssl.button': 'Ver painel',
    'ssl.footer': 'Você está recebendo este e-mail porque tem o monitoramento SSL ativado para {domain}.',
    'ssl.textAction': 'Por favor, renove seu certificado SSL antes da data de vencimento.',
    'domain.subject': 'Alerta de expiração do domínio: {domain}',
    'domain.title': 'Alerta de expiração do domínio',
    'domain.urgentTomorrow': 'URGENTE: Seu domínio expira amanhã!',
    'domain.warningDays': 'Aviso: Seu domínio expira em {days} dias',
    'domain.reminderDays': 'Lembrete: Seu domínio expira em {days} dias',
    'domain.action': 'Se seu domínio expirar e não for renovado, você pode perder a propriedade permanentemente.',
    'domain.button': 'Ver painel',
    'domain.footer': 'Você está recebendo este e-mail porque tem o monitoramento de domínio ativado para {domain}.',
    'domain.textAction': 'IMPORTANTE: Se seu domínio expirar e não for renovado, você pode perder a propriedade permanentemente.',
    'renewal.subject': '{type} renovado: {domain}',
    'renewal.title': '{type} renovado',
    'renewal.body': 'Ótimas notícias! Seu {type} foi renovado.',
    'renewal.domain': 'Domínio:',
    'renewal.previousExpiry': 'Expiração anterior:',
    'renewal.newExpiry': 'Nova expiração:',
    'renewal.extendedBy': 'Estendido por:',
    'renewal.daysUnit': '{days} dias',
    'renewal.resetNotice': 'Seu ciclo de notificação foi redefinido para a nova data de vencimento.',
    'renewal.button': 'Ver painel',
    'renewal.footer': 'Você está recebendo este e-mail porque tem notificações de renovação ativadas para {domain}.',
    'common.important': 'Importante:',
  },
  ja: {
    'verify.subject': 'メールアドレスの確認',
    'verify.title': 'メール確認',
    'verify.body': 'ご登録ありがとうございます！下のボタンをクリックしてメールアドレスを確認してください：',
    'verify.button': 'メールを確認',
    'verify.linkText': 'または、このリンクをブラウザにコピー＆ペーストしてください：',
    'verify.footer': 'このリンクは24時間で期限切れになります。アカウントを作成していない場合は、このメールを無視してください。',
    'verify.textOnly': '次のリンクでメールを確認してください：',
    'reset.subject': 'パスワードのリセット',
    'reset.title': 'パスワードのリセット',
    'reset.body': 'パスワードのリセットがリクエストされました。下のボタンをクリックして新しいパスワードを作成してください：',
    'reset.button': 'パスワードをリセット',
    'reset.linkText': 'または、このリンクをブラウザにコピー＆ペーストしてください：',
    'reset.footer': 'このリンクは1時間で期限切れになります。リセットをリクエストしていない場合は、このメールを無視してください。',
    'reset.textOnly': '次のリンクでパスワードをリセットしてください：',
    'ssl.subject': 'SSL証明書の有効期限アラート: {domain}',
    'ssl.title': 'SSL証明書の有効期限アラート',
    'ssl.urgentTomorrow': '緊急：SSL証明書が明日期限切れになります！',
    'ssl.warningDays': '警告：SSL証明書が{days}日後に期限切れになります',
    'ssl.reminderDays': 'リマインダー：SSL証明書が{days}日後に期限切れになります',
    'ssl.domain': 'ドメイン：',
    'ssl.expiryDate': '有効期限：',
    'ssl.daysRemaining': '残り日数：',
    'ssl.action': 'サービスの中断やセキュリティ警告を避けるため、有効期限前にSSL証明書を更新してください。',
    'ssl.button': 'ダッシュボードを表示',
    'ssl.footer': '{domain}のSSL監視が有効になっているため、このメールが送信されています。',
    'ssl.textAction': '有効期限前にSSL証明書を更新してください。',
    'domain.subject': 'ドメイン有効期限アラート: {domain}',
    'domain.title': 'ドメイン有効期限アラート',
    'domain.urgentTomorrow': '緊急：ドメインが明日期限切れになります！',
    'domain.warningDays': '警告：ドメインが{days}日後に期限切れになります',
    'domain.reminderDays': 'リマインダー：ドメインが{days}日後に期限切れになります',
    'domain.action': 'ドメインが期限切れになり更新されない場合、所有権を永久に失う可能性があります。',
    'domain.button': 'ダッシュボードを表示',
    'domain.footer': '{domain}のドメイン監視が有効になっているため、このメールが送信されています。',
    'domain.textAction': '重要：ドメインが期限切れになると、所有権を永久に失う可能性があります。',
    'renewal.subject': '{type}が更新されました: {domain}',
    'renewal.title': '{type}が更新されました',
    'renewal.body': '朗報です！{type}が更新されました。',
    'renewal.domain': 'ドメイン：',
    'renewal.previousExpiry': '前回の有効期限：',
    'renewal.newExpiry': '新しい有効期限：',
    'renewal.extendedBy': '延長期間：',
    'renewal.daysUnit': '{days}日',
    'renewal.resetNotice': '新しい有効期限に合わせて通知サイクルがリセットされました。',
    'renewal.button': 'ダッシュボードを表示',
    'renewal.footer': '{domain}の更新通知が有効になっているため、このメールが送信されています。',
    'common.important': '重要：',
  },
  zh: {
    'verify.subject': '验证您的电子邮件地址',
    'verify.title': '验证您的电子邮件',
    'verify.body': '感谢您的注册！请点击下面的按钮验证您的电子邮件地址：',
    'verify.button': '验证邮箱',
    'verify.linkText': '或将此链接复制到浏览器中：',
    'verify.footer': '此链接将在24小时后过期。如果您未创建帐户，可以忽略此邮件。',
    'verify.textOnly': '请访问以下链接验证您的邮箱：',
    'reset.subject': '重置您的密码',
    'reset.title': '重置您的密码',
    'reset.body': '您请求了密码重置。请点击下面的按钮创建新密码：',
    'reset.button': '重置密码',
    'reset.linkText': '或将此链接复制到浏览器中：',
    'reset.footer': '此链接将在1小时后过期。如果您未请求密码重置，可以忽略此邮件。',
    'reset.textOnly': '请访问以下链接重置您的密码：',
    'ssl.subject': 'SSL证书到期警报: {domain}',
    'ssl.title': 'SSL证书到期警报',
    'ssl.urgentTomorrow': '紧急：您的SSL证书明天到期！',
    'ssl.warningDays': '警告：您的SSL证书将在{days}天后到期',
    'ssl.reminderDays': '提醒：您的SSL证书将在{days}天后到期',
    'ssl.domain': '域名：',
    'ssl.expiryDate': '到期日期：',
    'ssl.daysRemaining': '剩余天数：',
    'ssl.action': '为避免服务中断和安全警告，请在到期日期之前续订您的SSL证书。',
    'ssl.button': '查看控制面板',
    'ssl.footer': '您收到此邮件是因为您已为{domain}启用了SSL监控。',
    'ssl.textAction': '请在到期日期之前续订您的SSL证书。',
    'domain.subject': '域名到期警报: {domain}',
    'domain.title': '域名到期警报',
    'domain.urgentTomorrow': '紧急：您的域名明天到期！',
    'domain.warningDays': '警告：您的域名将在{days}天后到期',
    'domain.reminderDays': '提醒：您的域名将在{days}天后到期',
    'domain.action': '如果您的域名过期且未续订，您可能会永久失去所有权。其他人可能会注册该域名。',
    'domain.button': '查看控制面板',
    'domain.footer': '您收到此邮件是因为您已为{domain}启用了域名监控。',
    'domain.textAction': '重要提示：如果域名过期且未续订，您可能会永久失去所有权。',
    'renewal.subject': '{type}已续订: {domain}',
    'renewal.title': '{type}已续订',
    'renewal.body': '好消息！您的{type}已续订。',
    'renewal.domain': '域名：',
    'renewal.previousExpiry': '之前到期日：',
    'renewal.newExpiry': '新到期日：',
    'renewal.extendedBy': '延长：',
    'renewal.daysUnit': '{days}天',
    'renewal.resetNotice': '您的通知周期已根据新的到期日重置。',
    'renewal.button': '查看控制面板',
    'renewal.footer': '您收到此邮件是因为您已为{domain}启用了续订通知。',
    'common.important': '重要：',
  },
  hi: {
    'verify.subject': 'अपना ईमेल पता सत्यापित करें',
    'verify.title': 'अपना ईमेल सत्यापित करें',
    'verify.body': 'पंजीकरण के लिए धन्यवाद! कृपया अपना ईमेल पता सत्यापित करने के लिए नीचे दिए गए बटन पर क्लिक करें:',
    'verify.button': 'ईमेल सत्यापित करें',
    'verify.linkText': 'या इस लिंक को अपने ब्राउज़र में कॉपी और पेस्ट करें:',
    'verify.footer': 'यह लिंक 24 घंटे में समाप्त हो जाएगा। यदि आपने कोई खाता नहीं बनाया है, तो आप इस ईमेल को अनदेखा कर सकते हैं।',
    'verify.textOnly': 'अपना ईमेल सत्यापित करने के लिए यहाँ जाएँ:',
    'reset.subject': 'अपना पासवर्ड रीसेट करें',
    'reset.title': 'अपना पासवर्ड रीसेट करें',
    'reset.body': 'आपने अपना पासवर्ड रीसेट करने का अनुरोध किया है। नया पासवर्ड बनाने के लिए नीचे दिए गए बटन पर क्लिक करें:',
    'reset.button': 'पासवर्ड रीसेट करें',
    'reset.linkText': 'या इस लिंक को अपने ब्राउज़र में कॉपी और पेस्ट करें:',
    'reset.footer': 'यह लिंक 1 घंटे में समाप्त हो जाएगा। यदि आपने रीसेट का अनुरोध नहीं किया है, तो आप इस ईमेल को अनदेखा कर सकते हैं।',
    'reset.textOnly': 'अपना पासवर्ड रीसेट करने के लिए यहाँ जाएँ:',
    'ssl.subject': 'SSL प्रमाणपत्र समाप्ति अलर्ट: {domain}',
    'ssl.title': 'SSL प्रमाणपत्र समाप्ति अलर्ट',
    'ssl.urgentTomorrow': 'अत्यावश्यक: आपका SSL प्रमाणपत्र कल समाप्त हो रहा है!',
    'ssl.warningDays': 'चेतावनी: आपका SSL प्रमाणपत्र {days} दिनों में समाप्त हो रहा है',
    'ssl.reminderDays': 'अनुस्मारक: आपका SSL प्रमाणपत्र {days} दिनों में समाप्त हो रहा है',
    'ssl.domain': 'डोमेन:',
    'ssl.expiryDate': 'समाप्ति तिथि:',
    'ssl.daysRemaining': 'शेष दिन:',
    'ssl.action': 'सेवा बाधाओं और सुरक्षा चेतावनियों से बचने के लिए, कृपया समाप्ति तिथि से पहले अपना SSL प्रमाणपत्र नवीनीकृत करें।',
    'ssl.button': 'डैशबोर्ड देखें',
    'ssl.footer': 'आपको यह ईमेल इसलिए प्राप्त हो रहा है क्योंकि आपने {domain} के लिए SSL निगरानी सक्षम की है।',
    'ssl.textAction': 'कृपया समाप्ति तिथि से पहले अपना SSL प्रमाणपत्र नवीनीकृत करें।',
    'domain.subject': 'डोमेन समाप्ति अलर्ट: {domain}',
    'domain.title': 'डोमेन समाप्ति अलर्ट',
    'domain.urgentTomorrow': 'अत्यावश्यक: आपका डोमेन कल समाप्त हो रहा है!',
    'domain.warningDays': 'चेतावनी: आपका डोमेन {days} दिनों में समाप्त हो रहा है',
    'domain.reminderDays': 'अनुस्मारक: आपका डोमेन {days} दिनों में समाप्त हो रहा है',
    'domain.action': 'यदि आपका डोमेन समाप्त हो जाता है और नवीनीकृत नहीं किया जाता है, तो आप स्वामित्व स्थायी रूप से खो सकते हैं।',
    'domain.button': 'डैशबोर्ड देखें',
    'domain.footer': 'आपको यह ईमेल इसलिए प्राप्त हो रहा है क्योंकि आपने {domain} के लिए डोमेन निगरानी सक्षम की है।',
    'domain.textAction': 'महत्वपूर्ण: यदि आपका डोमेन समाप्त हो जाता है, तो आप स्वामित्व स्थायी रूप से खो सकते हैं।',
    'renewal.subject': '{type} नवीनीकृत: {domain}',
    'renewal.title': '{type} नवीनीकृत',
    'renewal.body': 'अच्छी खबर! आपका {type} नवीनीकृत कर दिया गया है।',
    'renewal.domain': 'डोमेन:',
    'renewal.previousExpiry': 'पिछली समाप्ति:',
    'renewal.newExpiry': 'नई समाप्ति:',
    'renewal.extendedBy': 'विस्तारित:',
    'renewal.daysUnit': '{days} दिन',
    'renewal.resetNotice': 'नई समाप्ति तिथि के लिए आपका अधिसूचना चक्र रीसेट कर दिया गया है।',
    'renewal.button': 'डैशबोर्ड देखें',
    'renewal.footer': 'आपको यह ईमेल इसलिए प्राप्त हो रहा है क्योंकि आपने {domain} के लिए नवीनीकरण अधिसूचनाएँ सक्षम की हैं।',
    'common.important': 'महत्वपूर्ण:',
  },
  ar: {
    'verify.subject': 'تحقق من عنوان بريدك الإلكتروني',
    'verify.title': 'تحقق من بريدك الإلكتروني',
    'verify.body': 'شكراً لتسجيلك! يرجى النقر على الزر أدناه للتحقق من عنوان بريدك الإلكتروني:',
    'verify.button': 'تحقق من البريد الإلكتروني',
    'verify.linkText': 'أو انسخ والصق هذا الرابط في متصفحك:',
    'verify.footer': 'ستنتهي صلاحية هذا الرابط خلال 24 ساعة. إذا لم تقم بإنشاء حساب، يمكنك تجاهل هذا البريد.',
    'verify.textOnly': 'تحقق من بريدك الإلكتروني بزيارة:',
    'reset.subject': 'إعادة تعيين كلمة المرور',
    'reset.title': 'إعادة تعيين كلمة المرور',
    'reset.body': 'لقد طلبت إعادة تعيين كلمة المرور. انقر على الزر أدناه لإنشاء كلمة مرور جديدة:',
    'reset.button': 'إعادة تعيين كلمة المرور',
    'reset.linkText': 'أو انسخ والصق هذا الرابط في متصفحك:',
    'reset.footer': 'ستنتهي صلاحية هذا الرابط خلال ساعة واحدة. إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذا البريد.',
    'reset.textOnly': 'أعد تعيين كلمة المرور بزيارة:',
    'ssl.subject': 'تنبيه انتهاء شهادة SSL: {domain}',
    'ssl.title': 'تنبيه انتهاء شهادة SSL',
    'ssl.urgentTomorrow': 'عاجل: تنتهي شهادة SSL الخاصة بك غداً!',
    'ssl.warningDays': 'تحذير: تنتهي شهادة SSL الخاصة بك خلال {days} أيام',
    'ssl.reminderDays': 'تذكير: تنتهي شهادة SSL الخاصة بك خلال {days} أيام',
    'ssl.domain': 'النطاق:',
    'ssl.expiryDate': 'تاريخ الانتهاء:',
    'ssl.daysRemaining': 'الأيام المتبقية:',
    'ssl.action': 'لتجنب انقطاع الخدمة، يرجى تجديد شهادة SSL قبل تاريخ الانتهاء.',
    'ssl.button': 'عرض لوحة التحكم',
    'ssl.footer': 'تتلقى هذا البريد لأنك قمت بتمكين مراقبة SSL لـ {domain}.',
    'ssl.textAction': 'يرجى تجديد شهادة SSL قبل تاريخ الانتهاء.',
    'domain.subject': 'تنبيه انتهاء النطاق: {domain}',
    'domain.title': 'تنبيه انتهاء النطاق',
    'domain.urgentTomorrow': 'عاجل: ينتهي نطاقك غداً!',
    'domain.warningDays': 'تحذير: ينتهي نطاقك خلال {days} أيام',
    'domain.reminderDays': 'تذكير: ينتهي نطاقك خلال {days} أيام',
    'domain.action': 'إذا انتهت صلاحية نطاقك ولم يتم تجديده، فقد تفقد ملكيته بشكل دائم.',
    'domain.button': 'عرض لوحة التحكم',
    'domain.footer': 'تتلقى هذا البريد لأنك قمت بتمكين مراقبة النطاق لـ {domain}.',
    'domain.textAction': 'مهم: إذا انتهت صلاحية نطاقك ولم يتم تجديده، فقد تفقد ملكيته بشكل دائم.',
    'renewal.subject': 'تم تجديد {type}: {domain}',
    'renewal.title': 'تم تجديد {type}',
    'renewal.body': 'أخبار سارة! تم تجديد {type} الخاص بك.',
    'renewal.domain': 'النطاق:',
    'renewal.previousExpiry': 'الانتهاء السابق:',
    'renewal.newExpiry': 'الانتهاء الجديد:',
    'renewal.extendedBy': 'تم التمديد بـ:',
    'renewal.daysUnit': '{days} أيام',
    'renewal.resetNotice': 'تم إعادة تعيين دورة الإشعارات لتاريخ الانتهاء الجديد.',
    'renewal.button': 'عرض لوحة التحكم',
    'renewal.footer': 'تتلقى هذا البريد لأنك قمت بتمكين إشعارات التجديد لـ {domain}.',
    'common.important': 'مهم:',
  },
  bn: {
    'verify.subject': 'আপনার ইমেল ঠিকানা যাচাই করুন',
    'verify.title': 'আপনার ইমেল যাচাই করুন',
    'verify.body': 'নিবন্ধনের জন্য ধন্যবাদ! আপনার ইমেল ঠিকানা যাচাই করতে নীচের বোতামে ক্লিক করুন:',
    'verify.button': 'ইমেল যাচাই করুন',
    'verify.linkText': 'অথবা এই লিংকটি আপনার ব্রাউজারে কপি এবং পেস্ট করুন:',
    'verify.footer': 'এই লিংকটি 24 ঘন্টায় মেয়াদ উত্তীর্ণ হবে। আপনি যদি কোনো অ্যাকাউন্ট তৈরি না করে থাকেন, তাহলে এই ইমেলটি উপেক্ষা করতে পারেন।',
    'verify.textOnly': 'আপনার ইমেল যাচাই করতে এখানে যান:',
    'reset.subject': 'আপনার পাসওয়ার্ড রিসেট করুন',
    'reset.title': 'আপনার পাসওয়ার্ড রিসেট করুন',
    'reset.body': 'আপনি পাসওয়ার্ড রিসেটের অনুরোধ করেছেন। নতুন পাসওয়ার্ড তৈরি করতে নীচের বোতামে ক্লিক করুন:',
    'reset.button': 'পাসওয়ার্ড রিসেট করুন',
    'reset.linkText': 'অথবা এই লিংকটি আপনার ব্রাউজারে কপি এবং পেস্ট করুন:',
    'reset.footer': 'এই লিংকটি 1 ঘন্টায় মেয়াদ উত্তীর্ণ হবে।',
    'reset.textOnly': 'আপনার পাসওয়ার্ড রিসেট করতে এখানে যান:',
    'ssl.subject': 'SSL সার্টিফিকেট মেয়াদ সতর্কতা: {domain}',
    'ssl.title': 'SSL সার্টিফিকেট মেয়াদ সতর্কতা',
    'ssl.urgentTomorrow': 'জরুরি: আপনার SSL সার্টিফিকেট আগামীকাল মেয়াদ শেষ হচ্ছে!',
    'ssl.warningDays': 'সতর্কতা: আপনার SSL সার্টিফিকেট {days} দিনে মেয়াদ শেষ হচ্ছে',
    'ssl.reminderDays': 'স্মরণিকা: আপনার SSL সার্টিফিকেট {days} দিনে মেয়াদ শেষ হচ্ছে',
    'ssl.domain': 'ডোমেইন:',
    'ssl.expiryDate': 'মেয়াদ শেষের তারিখ:',
    'ssl.daysRemaining': 'বাকি দিন:',
    'ssl.action': 'সেবা বিঘ্ন এড়াতে, দয়া করে মেয়াদ শেষের আগে আপনার SSL সার্টিফিকেট নবায়ন করুন।',
    'ssl.button': 'ড্যাশবোর্ড দেখুন',
    'ssl.footer': '{domain}-এর জন্য SSL পর্যবেক্ষণ সক্রিয় থাকায় আপনি এই ইমেল পাচ্ছেন।',
    'ssl.textAction': 'দয়া করে মেয়াদ শেষের আগে আপনার SSL সার্টিফিকেট নবায়ন করুন।',
    'domain.subject': 'ডোমেইন মেয়াদ সতর্কতা: {domain}',
    'domain.title': 'ডোমেইন মেয়াদ সতর্কতা',
    'domain.urgentTomorrow': 'জরুরি: আপনার ডোমেইন আগামীকাল মেয়াদ শেষ হচ্ছে!',
    'domain.warningDays': 'সতর্কতা: আপনার ডোমেইন {days} দিনে মেয়াদ শেষ হচ্ছে',
    'domain.reminderDays': 'স্মরণিকা: আপনার ডোমেইন {days} দিনে মেয়াদ শেষ হচ্ছে',
    'domain.action': 'আপনার ডোমেইন মেয়াদ শেষ হয়ে গেলে এবং নবায়ন না হলে, আপনি স্থায়ীভাবে মালিকানা হারাতে পারেন।',
    'domain.button': 'ড্যাশবোর্ড দেখুন',
    'domain.footer': '{domain}-এর জন্য ডোমেইন পর্যবেক্ষণ সক্রিয় থাকায় আপনি এই ইমেল পাচ্ছেন।',
    'domain.textAction': 'গুরুত্বপূর্ণ: আপনার ডোমেইন মেয়াদ শেষ হলে আপনি স্থায়ীভাবে মালিকানা হারাতে পারেন।',
    'renewal.subject': '{type} নবায়ন হয়েছে: {domain}',
    'renewal.title': '{type} নবায়ন হয়েছে',
    'renewal.body': 'সুখবর! আপনার {type} নবায়ন হয়েছে।',
    'renewal.domain': 'ডোমেইন:',
    'renewal.previousExpiry': 'পূর্ববর্তী মেয়াদ:',
    'renewal.newExpiry': 'নতুন মেয়াদ:',
    'renewal.extendedBy': 'বর্ধিত:',
    'renewal.daysUnit': '{days} দিন',
    'renewal.resetNotice': 'নতুন মেয়াদ শেষের তারিখের জন্য আপনার বিজ্ঞপ্তি চক্র রিসেট করা হয়েছে।',
    'renewal.button': 'ড্যাশবোর্ড দেখুন',
    'renewal.footer': '{domain}-এর জন্য নবায়ন বিজ্ঞপ্তি সক্রিয় থাকায় আপনি এই ইমেল পাচ্ছেন।',
    'common.important': 'গুরুত্বপূর্ণ:',
  },
  ru: {
    'verify.subject': 'Подтвердите ваш адрес электронной почты',
    'verify.title': 'Подтвердите ваш e-mail',
    'verify.body': 'Спасибо за регистрацию! Нажмите кнопку ниже, чтобы подтвердить ваш адрес электронной почты:',
    'verify.button': 'Подтвердить e-mail',
    'verify.linkText': 'Или скопируйте и вставьте эту ссылку в ваш браузер:',
    'verify.footer': 'Срок действия ссылки истекает через 24 часа. Если вы не создавали учетную запись, проигнорируйте это письмо.',
    'verify.textOnly': 'Подтвердите ваш e-mail, перейдя по ссылке:',
    'reset.subject': 'Сброс пароля',
    'reset.title': 'Сброс пароля',
    'reset.body': 'Вы запросили сброс пароля. Нажмите кнопку ниже, чтобы создать новый пароль:',
    'reset.button': 'Сбросить пароль',
    'reset.linkText': 'Или скопируйте и вставьте эту ссылку в ваш браузер:',
    'reset.footer': 'Срок действия ссылки истекает через 1 час. Если вы не запрашивали сброс, проигнорируйте это письмо.',
    'reset.textOnly': 'Сбросьте пароль, перейдя по ссылке:',
    'ssl.subject': 'Предупреждение об истечении SSL-сертификата: {domain}',
    'ssl.title': 'Предупреждение об истечении SSL-сертификата',
    'ssl.urgentTomorrow': 'СРОЧНО: Ваш SSL-сертификат истекает завтра!',
    'ssl.warningDays': 'Внимание: Ваш SSL-сертификат истекает через {days} дней',
    'ssl.reminderDays': 'Напоминание: Ваш SSL-сертификат истекает через {days} дней',
    'ssl.domain': 'Домен:',
    'ssl.expiryDate': 'Дата истечения:',
    'ssl.daysRemaining': 'Осталось дней:',
    'ssl.action': 'Чтобы избежать перебоев в обслуживании, обновите SSL-сертификат до даты истечения.',
    'ssl.button': 'Открыть панель управления',
    'ssl.footer': 'Вы получаете это письмо, потому что у вас включен мониторинг SSL для {domain}.',
    'ssl.textAction': 'Пожалуйста, обновите SSL-сертификат до даты истечения.',
    'domain.subject': 'Предупреждение об истечении домена: {domain}',
    'domain.title': 'Предупреждение об истечении домена',
    'domain.urgentTomorrow': 'СРОЧНО: Ваш домен истекает завтра!',
    'domain.warningDays': 'Внимание: Ваш домен истекает через {days} дней',
    'domain.reminderDays': 'Напоминание: Ваш домен истекает через {days} дней',
    'domain.action': 'Если ваш домен истечёт и не будет продлён, вы можете навсегда потерять право собственности.',
    'domain.button': 'Открыть панель управления',
    'domain.footer': 'Вы получаете это письмо, потому что у вас включен мониторинг домена для {domain}.',
    'domain.textAction': 'ВАЖНО: Если ваш домен истечёт, вы можете навсегда потерять право собственности.',
    'renewal.subject': '{type} продлён: {domain}',
    'renewal.title': '{type} продлён',
    'renewal.body': 'Отличные новости! Ваш {type} был продлён.',
    'renewal.domain': 'Домен:',
    'renewal.previousExpiry': 'Предыдущая дата истечения:',
    'renewal.newExpiry': 'Новая дата истечения:',
    'renewal.extendedBy': 'Продлён на:',
    'renewal.daysUnit': '{days} дней',
    'renewal.resetNotice': 'Цикл уведомлений сброшен для новой даты истечения.',
    'renewal.button': 'Открыть панель управления',
    'renewal.footer': 'Вы получаете это письмо, потому что у вас включены уведомления о продлении для {domain}.',
    'common.important': 'Важно:',
  },
};

function emailT(locale: string, key: string, params?: Record<string, string | number>): string {
  const lang = (locale in emailTranslations ? locale : 'en') as SupportedLocale;
  let text = emailTranslations[lang][key] || emailTranslations['en'][key] || key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return text;
}

function formatLocalizedDate(date: Date, locale: string): string {
  // Map our locale codes to BCP 47 locale tags for Intl
  const localeMap: Record<string, string> = {
    en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', pt: 'pt-BR',
    ja: 'ja-JP', zh: 'zh-CN', hi: 'hi-IN', ar: 'ar-SA', bn: 'bn-BD', ru: 'ru-RU',
  };
  const intlLocale = localeMap[locale] || 'en-US';
  return date.toLocaleDateString(intlLocale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================
// Email Functions
// ============================================

export async function sendVerificationEmail(
  email: string,
  token: string,
  appUrl: string,
  locale: string = 'en'
): Promise<boolean> {
  const verificationUrl = `${appUrl}/verify-email?token=${token}`;

  return sendEmail({
    to: email,
    subject: emailT(locale, 'verify.subject'),
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">${emailT(locale, 'verify.title')}</h1>
            <p>${emailT(locale, 'verify.body')}</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${verificationUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                ${emailT(locale, 'verify.button')}
              </a>
            </p>
            <p>${emailT(locale, 'verify.linkText')}</p>
            <p style="word-break: break-all; color: #666;">${verificationUrl}</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              ${emailT(locale, 'verify.footer')}
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `${emailT(locale, 'verify.textOnly')} ${verificationUrl}`,
  });
}

export async function sendPasswordResetEmail(
  email: string,
  token: string,
  appUrl: string,
  locale: string = 'en'
): Promise<boolean> {
  const resetUrl = `${appUrl}/reset-password?token=${token}`;

  return sendEmail({
    to: email,
    subject: emailT(locale, 'reset.subject'),
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: #2563eb;">${emailT(locale, 'reset.title')}</h1>
            <p>${emailT(locale, 'reset.body')}</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                ${emailT(locale, 'reset.button')}
              </a>
            </p>
            <p>${emailT(locale, 'reset.linkText')}</p>
            <p style="word-break: break-all; color: #666;">${resetUrl}</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              ${emailT(locale, 'reset.footer')}
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `${emailT(locale, 'reset.textOnly')} ${resetUrl}`,
  });
}

export async function sendSSLExpiryAlert(
  email: string,
  domain: string,
  expiryDate: Date,
  daysRemaining: number,
  appUrl: string,
  locale: string = 'en'
): Promise<boolean> {
  const dashboardUrl = `${appUrl}/dashboard`;
  const formattedDate = formatLocalizedDate(expiryDate, locale);

  const urgencyColor = daysRemaining <= 7 ? '#dc2626' : daysRemaining <= 30 ? '#f59e0b' : '#2563eb';
  const urgencyText = daysRemaining <= 1
    ? emailT(locale, 'ssl.urgentTomorrow')
    : daysRemaining <= 7
    ? emailT(locale, 'ssl.warningDays', { days: daysRemaining })
    : emailT(locale, 'ssl.reminderDays', { days: daysRemaining });

  return sendEmail({
    to: email,
    subject: emailT(locale, 'ssl.subject', { domain }),
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: ${urgencyColor};">${emailT(locale, 'ssl.title')}</h1>
            <div style="background-color: #f8f9fa; border-left: 4px solid ${urgencyColor}; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: ${urgencyColor};">${urgencyText}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'ssl.domain')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${domain}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'ssl.expiryDate')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'ssl.daysRemaining')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; color: ${urgencyColor}; font-weight: bold;">${daysRemaining}</td>
              </tr>
            </table>
            <p>${emailT(locale, 'ssl.action')}</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                ${emailT(locale, 'ssl.button')}
              </a>
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              ${emailT(locale, 'ssl.footer', { domain })}
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `${emailT(locale, 'ssl.title')} - ${domain}\n\n${urgencyText}\n\n${emailT(locale, 'ssl.domain')} ${domain}\n${emailT(locale, 'ssl.expiryDate')} ${formattedDate}\n${emailT(locale, 'ssl.daysRemaining')} ${daysRemaining}\n\n${emailT(locale, 'ssl.textAction')}\n\n${emailT(locale, 'ssl.button')}: ${dashboardUrl}`,
  });
}

export async function sendDomainExpiryAlert(
  email: string,
  domain: string,
  expiryDate: Date,
  daysRemaining: number,
  appUrl: string,
  locale: string = 'en'
): Promise<boolean> {
  const dashboardUrl = `${appUrl}/dashboard`;
  const formattedDate = formatLocalizedDate(expiryDate, locale);

  const urgencyColor = daysRemaining <= 7 ? '#dc2626' : daysRemaining <= 30 ? '#f59e0b' : '#2563eb';
  const urgencyText = daysRemaining <= 1
    ? emailT(locale, 'domain.urgentTomorrow')
    : daysRemaining <= 7
    ? emailT(locale, 'domain.warningDays', { days: daysRemaining })
    : emailT(locale, 'domain.reminderDays', { days: daysRemaining });

  return sendEmail({
    to: email,
    subject: emailT(locale, 'domain.subject', { domain }),
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: ${urgencyColor};">${emailT(locale, 'domain.title')}</h1>
            <div style="background-color: #f8f9fa; border-left: 4px solid ${urgencyColor}; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: ${urgencyColor};">${urgencyText}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'ssl.domain')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${domain}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'ssl.expiryDate')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${formattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'ssl.daysRemaining')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; color: ${urgencyColor}; font-weight: bold;">${daysRemaining}</td>
              </tr>
            </table>
            <p><strong>${emailT(locale, 'common.important')}</strong> ${emailT(locale, 'domain.action')}</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}"
                 style="background-color: #2563eb; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                ${emailT(locale, 'domain.button')}
              </a>
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              ${emailT(locale, 'domain.footer', { domain })}
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `${emailT(locale, 'domain.title')} - ${domain}\n\n${urgencyText}\n\n${emailT(locale, 'ssl.domain')} ${domain}\n${emailT(locale, 'ssl.expiryDate')} ${formattedDate}\n${emailT(locale, 'ssl.daysRemaining')} ${daysRemaining}\n\n${emailT(locale, 'domain.textAction')}\n\n${emailT(locale, 'domain.button')}: ${dashboardUrl}`,
  });
}

export async function sendRenewalConfirmationAlert(
  email: string,
  domain: string,
  renewalType: string,
  previousExpiryDate: Date,
  newExpiryDate: Date,
  appUrl: string,
  locale: string = 'en'
): Promise<boolean> {
  const dashboardUrl = `${appUrl}/dashboard`;
  const previousFormattedDate = formatLocalizedDate(previousExpiryDate, locale);
  const newFormattedDate = formatLocalizedDate(newExpiryDate, locale);

  const diffTime = newExpiryDate.getTime() - previousExpiryDate.getTime();
  const daysAdded = isNaN(diffTime) ? 0 : Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  const successColor = '#10b981';
  const typeLabel = renewalType.toLowerCase();

  return sendEmail({
    to: email,
    subject: emailT(locale, 'renewal.subject', { type: renewalType, domain }),
    htmlContent: `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h1 style="color: ${successColor};">${emailT(locale, 'renewal.title', { type: renewalType })}</h1>
            <div style="background-color: #ecfdf5; border-left: 4px solid ${successColor}; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: ${successColor};">
                ${emailT(locale, 'renewal.body', { type: typeLabel })}
              </p>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'renewal.domain')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${domain}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'renewal.previousExpiry')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; color: #666; text-decoration: line-through;">${previousFormattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'renewal.newExpiry')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee; color: ${successColor}; font-weight: bold;">${newFormattedDate}</td>
              </tr>
              <tr>
                <td style="padding: 10px; border-bottom: 1px solid #eee; font-weight: bold;">${emailT(locale, 'renewal.extendedBy')}</td>
                <td style="padding: 10px; border-bottom: 1px solid #eee;">${emailT(locale, 'renewal.daysUnit', { days: daysAdded })}</td>
              </tr>
            </table>
            <p>${emailT(locale, 'renewal.resetNotice')}</p>
            <p style="text-align: center; margin: 30px 0;">
              <a href="${dashboardUrl}"
                 style="background-color: ${successColor}; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">
                ${emailT(locale, 'renewal.button')}
              </a>
            </p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">
              ${emailT(locale, 'renewal.footer', { domain })}
            </p>
          </div>
        </body>
      </html>
    `,
    textContent: `${emailT(locale, 'renewal.title', { type: renewalType })} - ${domain}\n\n${emailT(locale, 'renewal.body', { type: typeLabel })}\n\n${emailT(locale, 'renewal.domain')} ${domain}\n${emailT(locale, 'renewal.previousExpiry')} ${previousFormattedDate}\n${emailT(locale, 'renewal.newExpiry')} ${newFormattedDate}\n${emailT(locale, 'renewal.extendedBy')} ${emailT(locale, 'renewal.daysUnit', { days: daysAdded })}\n\n${emailT(locale, 'renewal.resetNotice')}\n\n${emailT(locale, 'renewal.button')}: ${dashboardUrl}`,
  });
}
