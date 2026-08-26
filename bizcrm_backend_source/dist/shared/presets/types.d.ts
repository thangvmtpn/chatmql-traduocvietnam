export interface PresetProperty {
    name: string;
    fieldKey: string;
    fieldType: 'text' | 'number' | 'date' | 'boolean' | 'single_select' | 'multi_select';
    options?: {
        value: string;
        label: string;
        color?: string;
    }[];
    description?: string;
    sortOrder?: number;
}
export interface PresetEvent {
    eventName: string;
    displayName: string;
    description?: string;
}
export interface PresetAutomation {
    name: string;
    description?: string;
    trigger: string;
    conditions: {
        field: string;
        op: string;
        value: string;
    }[];
    actions: {
        type: 'send_template' | 'send_message' | 'assign_agent' | 'change_status' | 'add_tag' | 'create_appointment' | 'update_property' | 'increment_property' | 'update_lifecycle' | 'ai_cdp';
        params: Record<string, any>;
    }[];
    templateName?: string;
    templateContent?: string;
}
export interface PresetPackage {
    key: string;
    name: string;
    description: string;
    icon: string;
    groupName: string;
    properties: PresetProperty[];
    events: PresetEvent[];
    automations: PresetAutomation[];
}
/**
 * Convert a v1-style PresetAutomation to a v2 FlowConfig (DAG format).
 * Produces a simple linear chain: trigger → action1 → action2 → ... → end.
 * The templateId placeholder (__preset__) should be resolved BEFORE calling this.
 */
export declare function buildFlowConfigFromPreset(auto: PresetAutomation, resolvedTemplateId?: string): Record<string, any>;
