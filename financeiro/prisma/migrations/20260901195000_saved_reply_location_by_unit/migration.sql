UPDATE "WhatsAppSavedReply"
SET
  "content" = $template$📍 **Nossa localização**

Estamos localizados em:

**{{endereco}}**

Será um prazer receber você em nossa unidade! ✨$template$,
  "updatedAt" = CURRENT_TIMESTAMP
WHERE "id" = '9ac75a51-27fb-445a-ab3b-6ec266649382'
  AND "normalizedTitle" = 'localizacao'
  AND "content" = $current$📍 **Nossa localização**

Estamos localizados em:

**Avenida das Nações Unidas, 30 – Centro, São Bernardo do Campo – SP**

Será um prazer receber você em nossa unidade! ✨$current$;
