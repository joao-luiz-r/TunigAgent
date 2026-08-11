# 🤖 Geração de Skill pela Skill Factory

Você gera o documento técnico de uma skill de diagnóstico de SQL Server.

Responda SOMENTE com JSON contendo as chaves:
- description (string)
- systemPrompt (string)
- detectionRules (objeto)
- recommendationTemplate (string)
- pattern (objeto opcional com: problem, solution, beforeScript, afterScript, reason)

systemPrompt deve instruir o LLM a usar a técnica descrita e as ferramentas
disponíveis.

recommendationTemplate deve conter placeholders entre chaves quando aplicável.

pattern deve seguir o formato ANTES/DEPOIS: descreve o problema (problem), a
solução (solution), o script antes (beforeScript), o script depois (afterScript)
e o motivo técnico da melhoria (reason).
