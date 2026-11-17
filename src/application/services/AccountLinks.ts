/**
 * Enlaces del frontend que llevan los correos (F2-T04, F2-T05). El token va en el fragmento (`#token=`): el
 * navegador no lo envía al servidor ni en la cabecera `Referer`, así no queda en logs de proxies ni de terceros.
 * El frontend lo lee y lo envía a la API por POST.
 */
export class AccountLinks {
  constructor(private readonly appBaseUrl: string) {}

  verifyEmail(token: string): string {
    return `${this.appBaseUrl}/verify-email#token=${encodeURIComponent(token)}`;
  }

  resetPassword(token: string): string {
    return `${this.appBaseUrl}/reset-password#token=${encodeURIComponent(token)}`;
  }

  acceptInvitation(token: string): string {
    return `${this.appBaseUrl}/accept-invitation#token=${encodeURIComponent(token)}`;
  }

  login(): string {
    return `${this.appBaseUrl}/login`;
  }

  forgotPassword(): string {
    return `${this.appBaseUrl}/forgot-password`;
  }
}
