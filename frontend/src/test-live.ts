import { testRobotsTxt } from './lib/seo/robotsService';

async function runLiveTest() {
  console.log('Testing live website: https://en.wikipedia.org...');
  try {
    const res = await testRobotsTxt({
      websiteUrl: 'https://en.wikipedia.org',
      path: '/wiki/Special:Search',
      userAgent: 'Googlebot'
    });

    console.log('Result Status:', res.result.status);
    console.log('Robots.txt status code:', res.robotsTxt.statusCode);
    console.log('Matched Rule:', res.result.appliedRule);
    console.log('Explanation:', res.result.explanation);
    console.log('Sitemaps extracted:', res.sitemaps.length);
    console.log('\nLive test completed successfully!');
  } catch (err) {
    console.error('Live test failed:', err);
  }
}

runLiveTest();
