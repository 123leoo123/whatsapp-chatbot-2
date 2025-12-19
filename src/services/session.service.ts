type SessionData = {
  lastCategory?: string;
  lastSubcategory?: string;
  lastProduct?: string;
  handedOff?: boolean;
};

const sessions = new Map<string, SessionData>();

/* =====================================================
   CATEGORY
===================================================== */
export const setLastCategory = (user: string, category: string) => {
  const current = sessions.get(user) ?? {};
  sessions.set(user, {
    ...current,
    lastCategory: category,
    lastSubcategory: undefined,
    lastProduct: undefined,
  });
};

export const getLastCategory = (user: string) => {
  return sessions.get(user)?.lastCategory;
};

/* =====================================================
   SUBCATEGORY
===================================================== */
export const setLastSubcategory = (user: string, subcategory: string) => {
  const current = sessions.get(user) ?? {};
  sessions.set(user, {
    ...current,
    lastSubcategory: subcategory,
    lastProduct: undefined,
  });
};

export const getLastSubcategory = (user: string) => {
  return sessions.get(user)?.lastSubcategory;
};

/* =====================================================
   PRODUCT
===================================================== */
export const setLastProduct = (user: string, productId: string) => {
  const current = sessions.get(user) ?? {};
  sessions.set(user, {
    ...current,
    lastProduct: productId,
  });
};

export const getLastProduct = (user: string) => {
  return sessions.get(user)?.lastProduct;
};

/* =====================================================
   GREETING STATUS (rastreia se usuário já foi saudado)
===================================================== */
// Greeting/menu-first model removed in Chatbot 2.0 — no greeted state

/* =====================================================
   RESET (opcional, mas útil)
===================================================== */
export const resetSession = (user: string) => {
  sessions.delete(user);
};

/* =====================================================
   HANDOFF (encaminhamento para atendente humano)
===================================================== */
export const setHandOff = (user: string) => {
  const current = sessions.get(user) ?? {};
  sessions.set(user, {
    ...current,
    handedOff: true,
  });
};

export const isHandedOff = (user: string) => {
  return sessions.get(user)?.handedOff ?? false;
};
