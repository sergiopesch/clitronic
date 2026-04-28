# Clitronic Quality Rubric

Score each item from 0 to 5.

## Answer

- `relevance_to_user_intent`: The answer directly addresses the actual project, constraint, or troubleshooting need.
- `domain_specificity`: The answer uses electronics, maker, smart-home, workshop, or low-voltage details instead of generic home-improvement advice.
- `practical_actionability`: The answer gives steps, architecture, checks, layouts, or decisions the user can apply.
- `concrete_parts_materials_tools`: The answer names real classes of parts, materials, tools, connectors, power supplies, modules, safety gear, or test equipment.
- `correct_ui_component_choice`: The chosen structured component fits the task shape.
- `technical_correctness`: The answer is technically plausible and avoids misleading wiring, power, RF, network, or battery guidance.
- `safety_and_code_awareness`: The answer flags mains electrical, fire, battery, ventilation, structural, and code-compliance boundaries where relevant.
- `avoidance_of_generic_advice`: The answer avoids vague advice that could apply to any project.
- `clarity_and_structure`: The answer is organized enough for the user to act on.

## Images

- `image_query_specificity`: The image search query contains the concrete visual subject, not just a broad category.
- `image_relevance_to_prompt`: Image metadata and query target the requested physical setup or component.
- `image_practical_usefulness`: Images would help a builder inspect layout, parts, routing, mounting, or real-world examples.
- `image_diversity`: Multi-image requests return distinct useful candidates.
- `image_quality_metadata`: Results include usable URLs, sources, attribution, confidence, and candidate counts.
- `absence_of_generic_stock_images`: Results avoid decor, offices, clipart, icons, renderings, and stock imagery when technical photos are needed.
- `answer_image_alignment`: The image query and results support the answer's recommendation or requested visual inspiration.

## Failure Flags

- `generic_answer`
- `missing_concrete_parts`
- `weak_project_plan`
- `unsafe_electrical_guidance`
- `ignored_constraints`
- `wrong_component_type`
- `shallow_image_query`
- `irrelevant_images`
- `duplicate_images`
- `stock_or_decor_images_when_technical_images_needed`
- `image_answer_mismatch`
- `broken_image_url`
