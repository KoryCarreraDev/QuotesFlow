export interface IPayload {
    sub: string;
    tenantId: string;
    role: string;
}

export interface IAuthTokenService {
    generateToken(payload: IPayload): string;
    verifyToken(token: string): IPayload;
};