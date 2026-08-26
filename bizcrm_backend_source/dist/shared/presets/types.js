// ─── Trigger label map (Vietnamese) ─────────────────────────────────
const TRIGGER_LABELS = {
    contact_created: 'Khách hàng mới được tạo',
    message_received: 'Nhận tin nhắn từ khách',
    message_sent: 'Gửi tin nhắn cho khách',
    status_changed: 'Trạng thái thay đổi',
    tag_added: 'Gán tag mới',
    tag_removed: 'Gỡ tag',
    property_changed: 'Property thay đổi',
    event_tracked: 'Event được ghi nhận',
    segment_entered: 'Vào segment',
    segment_exited: 'Rời segment',
    lifecycle_changed: 'Lifecycle thay đổi',
    conversation_idle: 'Sau tương tác',
    no_reply_24h: 'Không phản hồi 24h',
    appointment_upcoming: 'Lịch hẹn sắp đến',
    birthday_detected: 'Phát hiện sinh nhật',
};
// ─── Action label map (Vietnamese) ──────────────────────────────────
const ACTION_LABELS = {
    send_template: 'Gửi mẫu tin',
    send_message: 'Gửi tin nhắn (nội bộ)',
    assign_agent: 'Phân công Sale',
    change_status: 'Đổi trạng thái',
    add_tag: 'Gán tag',
    remove_tag: 'Gỡ tag',
    create_appointment: 'Tạo lịch hẹn',
    update_property: 'Cập nhật property',
    increment_property: 'Tăng/giảm property',
    track_event: 'Track event',
    update_lifecycle: 'Cập nhật lifecycle',
    ai_cdp: 'AI-CDP Phân tích',
};
/**
 * Convert a v1-style PresetAutomation to a v2 FlowConfig (DAG format).
 * Produces a simple linear chain: trigger → action1 → action2 → ... → end.
 * The templateId placeholder (__preset__) should be resolved BEFORE calling this.
 */
export function buildFlowConfigFromPreset(auto, resolvedTemplateId) {
    const triggerId = 'trigger_1';
    const triggerLabel = TRIGGER_LABELS[auto.trigger] || auto.trigger;
    // Build action nodes in linear sequence
    const nodes = [];
    const edges = [];
    let prevId = triggerId;
    for (let i = 0; i < auto.actions.length; i++) {
        const action = auto.actions[i];
        const nodeId = `node_preset_${i}`;
        // Resolve __preset__ templateId placeholder
        const params = { ...action.params };
        if (params.templateId === '__preset__' && resolvedTemplateId) {
            params.templateId = resolvedTemplateId;
        }
        nodes.push({
            id: nodeId,
            type: 'action',
            actionType: action.type,
            label: ACTION_LABELS[action.type] || action.type,
            config: params,
            position: { x: (i + 1) * 280, y: 100 },
            status: 'active',
        });
        edges.push({ source: prevId, target: nodeId });
        prevId = nodeId;
    }
    // Add condition nodes from v1 conditions (if any)
    // v1 conditions are simple field/op/value filters — convert to a single condition block
    if (auto.conditions.length > 0) {
        const condId = 'node_condition_0';
        // Insert condition node between trigger and first action
        const firstActionEdge = edges[0];
        edges[0] = { source: triggerId, target: condId };
        edges.splice(1, 0, { source: condId, target: firstActionEdge.target, label: 'true' });
        // False branch → end
        edges.push({ source: condId, target: 'node_end', label: 'false' });
        nodes.unshift({
            id: condId,
            type: 'condition',
            label: 'Kiểm tra điều kiện',
            config: {
                logic: 'and',
                rules: auto.conditions.map(c => ({
                    field: c.field,
                    op: c.op,
                    value: c.value,
                })),
            },
            position: { x: 280, y: 100 },
            status: 'active',
            branches: { true: [], false: [] },
        });
        // Shift action node positions right to accommodate condition
        for (const node of nodes.filter(n => n.type === 'action')) {
            node.position.x += 280;
        }
    }
    // Terminal edge to end
    edges.push({ source: prevId, target: 'node_end' });
    return {
        version: '2.0',
        metadata: {
            name: auto.name,
            description: auto.description || '',
            tags: ['preset'],
            createdBy: 'preset',
        },
        trigger: {
            id: triggerId,
            type: auto.trigger,
            label: triggerLabel,
            config: {},
            position: { x: 0, y: 100 },
        },
        nodes,
        edges,
    };
}
//# sourceMappingURL=types.js.map