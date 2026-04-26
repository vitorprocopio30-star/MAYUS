UPDATE public.agent_skills
SET requires_human_confirmation = true,
    risk_level = 'high',
    updated_at = now()
WHERE name = 'legal_artifact_publish_premium';
