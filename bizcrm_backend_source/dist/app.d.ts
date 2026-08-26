import 'dotenv/config';
declare module 'fastify' {
    interface FastifyInstance {
        jwt: import('@fastify/jwt').JWT;
    }
}
type JwtClaims = {
    id: string;
    email: string;
    fullName: string;
    role: string;
    orgId: string;
    impersonatedBy?: string;
    platformActorId?: string;
    kind?: 'company' | 'platform';
};
declare module '@fastify/jwt' {
    interface FastifyJWT {
        payload: JwtClaims;
        user: JwtClaims;
    }
}
export {};
