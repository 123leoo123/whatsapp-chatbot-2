type SessionData = {
  lastCategory?: string;
  lastSubcategory?: string;
  lastProductId?: string;
  greeted?: boolean;
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
    lastProductId: undefined,
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
    lastProductId: undefined,
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
    lastProductId: productId,
  });
};

export const getLastProduct = (user: string) => {
  return sessions.get(user)?.lastProductId;
};

/* =====================================================
   GREETING STATUS (rastreia se usuário já foi saudado)
===================================================== */
export const isUserGreeted = (user: string) => {
  return sessions.get(user)?.greeted ?? false;
};

export const markUserAsGreeted = (user: string) => {
  const current = sessions.get(user) ?? {};
  sessions.set(user, {
    ...current,
    greeted: true,
  });
};

/* =====================================================
   RESET (opcional, mas útil)
===================================================== */
export const resetSession = (user: string) => {
  sessions.delete(user);
};
