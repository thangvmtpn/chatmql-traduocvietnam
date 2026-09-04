/**
 * ai-bot-service.ts — AI Bot ("con AI") management.
 *
 * Each bot bundles per-bot config (persona/playbook prompt, provider+model,
 * tools, channel assignment). Org-level config remains the DEFAULT: a bot only
 * overrides fields it actually sets. The harness resolves the bot serving a
 * conversation via its channel account.
 *
 * Lưu ý (yêu cầu nghiệp vụ): BỘ TRAIN dùng CHUNG cho mọi Agent — kho tri thức,
 * kịch bản và tài liệu logic vẫn nằm ở cấp tổ chức. Bot chỉ ghi đè persona,
 * playbook, provider/model, tools và danh sách kênh nó phục vụ.
 */
import { prisma } from '../../shared/prisma-client.js';
import { getProviderConfig } from './provider-registry.js';
import { parseToolsDoc } from './tools-config-service.js';
function cleanChannelIds(ids) {
    return Array.isArray(ids)
        ? [...new Set(ids.filter((x) => typeof x === 'string' && x.trim().length > 0))]
        : [];
}
function validateInput(input) {
    if (input.provider && !getProviderConfig(input.provider)) {
        throw new Error(`Unknown provider: ${input.provider}`);
    }
    if (input.name !== undefined && !input.name.trim()) {
        throw new Error('Tên bot không được để trống');
    }
}
export async function listBots(orgId) {
    return prisma.aiBot.findMany({ where: { orgId }, orderBy: { createdAt: 'asc' } });
}
export async function getBot(orgId, id) {
    return prisma.aiBot.findFirst({ where: { id, orgId } });
}
/**
 * A channel is served by at most ONE bot — assigning a channel to this bot
 * silently removes it from any other bot of the org (last write wins).
 */
async function stealChannels(orgId, botId, channelIds) {
    if (channelIds.length === 0)
        return;
    const others = await prisma.aiBot.findMany({
        where: { orgId, id: { not: botId } },
        select: { id: true, channelAccountIds: true },
    });
    for (const other of others) {
        const current = cleanChannelIds(other.channelAccountIds);
        const kept = current.filter((c) => !channelIds.includes(c));
        if (kept.length !== current.length) {
            await prisma.aiBot.update({ where: { id: other.id }, data: { channelAccountIds: kept } });
        }
    }
}
export async function createBot(orgId, input) {
    validateInput(input);
    if (!input.name?.trim())
        throw new Error('Tên bot là bắt buộc');
    const channelIds = cleanChannelIds(input.channelAccountIds);
    const bot = await prisma.aiBot.create({
        data: {
            orgId,
            name: input.name.trim(),
            avatarEmoji: input.avatarEmoji ?? null,
            description: input.description ?? null,
            enabled: input.enabled ?? true,
            provider: input.provider || null,
            model: input.model || null,
            personaPrompt: input.personaPrompt || null,
            playbookPrompt: input.playbookPrompt || null,
            toolsJson: input.toolsJson ?? undefined,
            channelAccountIds: channelIds,
        },
    });
    await stealChannels(orgId, bot.id, channelIds);
    return bot;
}
export async function updateBot(orgId, id, input) {
    validateInput(input);
    const existing = await prisma.aiBot.findFirst({ where: { id, orgId }, select: { id: true } });
    if (!existing)
        throw new Error('Bot không tồn tại');
    const channelIds = input.channelAccountIds !== undefined ? cleanChannelIds(input.channelAccountIds) : undefined;
    const bot = await prisma.aiBot.update({
        where: { id },
        data: {
            ...(input.name !== undefined ? { name: input.name.trim() } : {}),
            ...(input.avatarEmoji !== undefined ? { avatarEmoji: input.avatarEmoji } : {}),
            ...(input.description !== undefined ? { description: input.description } : {}),
            ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
            ...(input.provider !== undefined ? { provider: input.provider || null } : {}),
            ...(input.model !== undefined ? { model: input.model || null } : {}),
            ...(input.personaPrompt !== undefined ? { personaPrompt: input.personaPrompt || null } : {}),
            ...(input.playbookPrompt !== undefined ? { playbookPrompt: input.playbookPrompt || null } : {}),
            ...(input.toolsJson !== undefined ? { toolsJson: input.toolsJson ?? undefined } : {}),
            ...(channelIds !== undefined ? { channelAccountIds: channelIds } : {}),
        },
    });
    if (channelIds !== undefined)
        await stealChannels(orgId, id, channelIds);
    return bot;
}
export async function deleteBot(orgId, id) {
    const res = await prisma.aiBot.deleteMany({ where: { id, orgId } });
    if (res.count === 0)
        throw new Error('Bot không tồn tại');
    return { deleted: true };
}
function toResolved(bot) {
    return {
        id: bot.id,
        name: bot.name,
        provider: bot.provider,
        model: bot.model,
        personaPrompt: bot.personaPrompt,
        playbookPrompt: bot.playbookPrompt,
        // parseToolsDoc handles shape coercion + defaults for missing tools
        toolsConfig: bot.toolsJson ? parseToolsDoc(JSON.stringify(bot.toolsJson)) : null,
    };
}
/** Bot serving a conversation (via its channel account), or null. */
export async function resolveBotForConversation(orgId, conversationId) {
    const conv = await prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { channelAccountId: true },
    });
    if (!conv?.channelAccountId)
        return null;
    // Orgs have a handful of bots — filter in JS beats a JSON-array query here.
    const bots = await prisma.aiBot.findMany({ where: { orgId, enabled: true } });
    const bot = bots.find((b) => cleanChannelIds(b.channelAccountIds).includes(conv.channelAccountId));
    return bot ? toResolved(bot) : null;
}
/** Bot by id (used by the simulator's per-bot demo chat). */
export async function resolveBotById(orgId, botId) {
    const bot = await prisma.aiBot.findFirst({ where: { id: botId, orgId } });
    return bot ? toResolved(bot) : null;
}
//# sourceMappingURL=ai-bot-service.js.map