function parsePagination(query, options = {}) {
  const defaultLimit = Number.isFinite(options.defaultLimit) ? options.defaultLimit : 50;
  const maxLimit = Number.isFinite(options.maxLimit) ? options.maxLimit : 500;
  const hasPagination = ['page', 'pageSize', 'limit', 'offset'].some((key) => query[key] !== undefined);

  if (!hasPagination) {
    return null;
  }

  const requestedLimit = parseInt(query.pageSize ?? query.limit ?? defaultLimit, 10);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), maxLimit)
    : defaultLimit;

  let offset;
  let page;

  if (query.offset !== undefined) {
    const parsedOffset = parseInt(query.offset, 10);
    offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;
    page = Math.floor(offset / limit) + 1;
  } else {
    const parsedPage = parseInt(query.page, 10);
    page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    offset = (page - 1) * limit;
  }

  return {
    limit,
    offset,
    page,
    pageSize: limit
  };
}

module.exports = {
  parsePagination
};
