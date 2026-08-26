export function badRequest(reply, message) {
    return reply.code(400).send({ error: message });
}
export function unauthorized(reply, message = 'Unauthorized') {
    return reply.code(401).send({ error: message });
}
export function forbidden(reply, message = 'Forbidden') {
    return reply.code(403).send({ error: message });
}
export function notFound(reply, entity = 'Resource') {
    return reply.code(404).send({ error: `${entity} not found` });
}
export function conflict(reply, message) {
    return reply.code(409).send({ error: message });
}
export function serverError(reply, message = 'Internal server error') {
    return reply.code(500).send({ error: message });
}
//# sourceMappingURL=http-errors.js.map