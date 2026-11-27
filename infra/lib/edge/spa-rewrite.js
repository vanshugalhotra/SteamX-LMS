function handler(event) {
  var request = event.request;
  if (!/\.[^/]+$/.test(request.uri)) {
    request.uri = '/index.html';
  }
  return request;
}
