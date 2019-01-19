import { MicrospatJsPage } from './app.po';

describe('microspat-js App', () => {
  let page: MicrospatJsPage;

  beforeEach(() => {
    page = new MicrospatJsPage();
  });

  it('should display message saying app works', () => {
    page.navigateTo();
    expect(page.getParagraphText()).toEqual('app works!');
  });
});
