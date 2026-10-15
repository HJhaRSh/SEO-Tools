import React from 'react';
import {
  ArticleFormState,
  BreadcrumbFormState,
  CourseFormState,
  DatasetFormState,
  EventFormState,
  FaqFormState,
  HowToFormState,
  JobPostingFormState,
  LocalBusinessFormState,
  OrganizationFormState,
  PersonFormState,
  ProductFormState,
  RecipeFormState,
  ServiceFormState,
  SoftwareAppFormState,
  SupportedSchemaType,
  VideoFormState,
  WebPageFormState,
  WebSiteFormState,
} from '@/lib/seo/schema/types';
import { generateRowId } from '@/lib/seo/schema/fieldUtils';

interface SchemaFormFieldsProps {
  schemaType: SupportedSchemaType;
  state: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
}

export default function SchemaFormFields({ schemaType, state, onChange }: SchemaFormFieldsProps) {
  // ----------------------------------------------------
  // ARTICLE / BLOG / NEWS
  // ----------------------------------------------------
  if (schemaType === 'Article' || schemaType === 'BlogPosting' || schemaType === 'NewsArticle') {
    const data = state as unknown as ArticleFormState;
    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group">
          <label className="label">
            Subtype <span className="text-red-500 font-bold">*</span>
          </label>
          <select
            className="select"
            value={data.subType || 'Article'}
            onChange={(e) => onChange('subType', e.target.value)}
          >
            <option value="Article">Article (Standard)</option>
            <option value="BlogPosting">BlogPosting (Blog post)</option>
            <option value="NewsArticle">NewsArticle (Journalistic news story)</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">
            Headline <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Understanding Technical SEO in 2026"
            value={data.headline || ''}
            onChange={(e) => onChange('headline', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description / Summary</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Brief synopsis or meta description of the article..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Canonical Article URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/blog/article-slug"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Image URL <span className="text-amber-500 text-xs font-semibold">(Recommended min 1200px)</span>
          </label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/images/hero.jpg"
            value={data.image || ''}
            onChange={(e) => onChange('image', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Author Type</label>
          <select
            className="select"
            value={data.authorType || 'Person'}
            onChange={(e) => onChange('authorType', e.target.value)}
          >
            <option value="Person">Person</option>
            <option value="Organization">Organization</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">
            Author Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Harsh Jha"
            value={data.authorName || ''}
            onChange={(e) => onChange('authorName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Author Profile URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/authors/harsh"
            value={data.authorUrl || ''}
            onChange={(e) => onChange('authorUrl', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Publisher Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Indian Marketers"
            value={data.publisherName || ''}
            onChange={(e) => onChange('publisherName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Publisher Logo URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/logo.png"
            value={data.publisherLogo || ''}
            onChange={(e) => onChange('publisherLogo', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Date Published <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="YYYY-MM-DD (e.g. 2026-10-15)"
            value={data.datePublished || ''}
            onChange={(e) => onChange('datePublished', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Date Modified</label>
          <input
            type="text"
            className="input"
            placeholder="YYYY-MM-DD or ISO 8601"
            value={data.dateModified || ''}
            onChange={(e) => onChange('dateModified', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Article Section / Category</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Technical SEO"
            value={data.articleSection || ''}
            onChange={(e) => onChange('articleSection', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Keywords</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. SEO, Schema, JSON-LD"
            value={data.keywords || ''}
            onChange={(e) => onChange('keywords', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // FAQ PAGE
  // ----------------------------------------------------
  if (schemaType === 'FAQPage') {
    const data = state as unknown as FaqFormState;
    const questions = data.questions || [];

    const handleAddQuestion = () => {
      onChange('questions', [
        ...questions,
        { id: generateRowId(), question: '', answer: '' },
      ]);
    };

    const handleRemoveQuestion = (id: string) => {
      onChange(
        'questions',
        questions.filter((q) => q.id !== id)
      );
    };

    const handleUpdateQuestion = (id: string, field: 'question' | 'answer', val: string) => {
      onChange(
        'questions',
        questions.map((q) => (q.id === id ? { ...q, [field]: val } : q))
      );
    };

    return (
      <div className="space-y-6 mt-6">
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-sm">
          <p className="font-bold flex items-center gap-2">
            <span>ℹ️</span> Official Google Rich Results Status:
          </p>
          <p className="mt-1">
            FAQPage remains an official Schema.org type, but Google discontinued FAQ rich results in May 2026. The structured data is still useful for entity search and non-Google AI agents.
          </p>
        </div>

        <div className="space-y-4">
          {questions.map((item, index) => (
            <div
              key={item.id}
              className="p-5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl relative"
            >
              <div className="flex justify-between items-center mb-3">
                <span className="font-extrabold text-sm text-slate-700 dark:text-slate-300">
                  Question #{index + 1}
                </span>
                {questions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveQuestion(item.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800"
                  >
                    Remove
                  </button>
                )}
              </div>
              <div className="space-y-3">
                <div>
                  <label className="label text-sm">Question</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. What is structured data?"
                    value={item.question}
                    onChange={(e) => handleUpdateQuestion(item.id, 'question', e.target.value)}
                  />
                </div>
                <div>
                  <label className="label text-sm">Accepted Answer</label>
                  <textarea
                    className="textarea"
                    rows={2}
                    placeholder="e.g. Structured data provides machine-readable information about webpage content."
                    value={item.answer}
                    onChange={(e) => handleUpdateQuestion(item.id, 'answer', e.target.value)}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddQuestion}
          className="btn btn-secondary text-sm py-2.5 px-4 font-bold inline-flex items-center gap-2"
        >
          <span>+ Add Question</span>
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // HOWTO
  // ----------------------------------------------------
  if (schemaType === 'HowTo') {
    const data = state as unknown as HowToFormState;
    const steps = data.steps || [];

    const handleAddStep = () => {
      onChange('steps', [
        ...steps,
        { id: generateRowId(), name: '', text: '', url: '', image: '' },
      ]);
    };

    const handleRemoveStep = (id: string) => {
      onChange(
        'steps',
        steps.filter((s) => s.id !== id)
      );
    };

    const handleUpdateStep = (id: string, field: string, val: string) => {
      onChange(
        'steps',
        steps.map((s) => (s.id === id ? { ...s, [field]: val } : s))
      );
    };

    return (
      <div className="space-y-6 mt-6">
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-amber-900 dark:text-amber-200 text-sm">
          <p className="font-bold flex items-center gap-2">
            <span>ℹ️</span> Official Google Rich Results Status:
          </p>
          <p className="mt-1">
            Google HowTo rich snippets are deprecated. HowTo markup is maintained in Schema.org and remains valid for assistant actions and semantic metadata.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="input-group md:col-span-2">
            <label className="label">
              HowTo Title / Name <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g. How to Clean a Mechanical Keyboard"
              value={data.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </div>

          <div className="input-group md:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="Step-by-step instructions on cleaning keycaps and mechanical switches..."
              value={data.description || ''}
              onChange={(e) => onChange('description', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Total Duration</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. 30 mins or PT30M"
              value={data.totalTime || ''}
              onChange={(e) => onChange('totalTime', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Hero Image URL</label>
            <input
              type="url"
              className="input"
              placeholder="https://example.com/images/howto.jpg"
              value={data.image || ''}
              onChange={(e) => onChange('image', e.target.value)}
            />
          </div>
        </div>

        <div>
          <h3 className="font-bold text-base mb-3 text-slate-800 dark:text-slate-200">HowTo Steps</h3>
          <div className="space-y-4">
            {steps.map((step, idx) => (
              <div
                key={step.id}
                className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl"
              >
                <div className="flex justify-between items-center mb-3">
                  <span className="font-extrabold text-sm">Step #{idx + 1}</span>
                  {steps.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveStep(step.id)}
                      className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded bg-rose-50 border border-rose-200"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="grid md:grid-cols-2 gap-3">
                  <div className="md:col-span-2">
                    <label className="label text-xs">Step Title</label>
                    <input
                      type="text"
                      className="input"
                      placeholder="e.g. Unplug the keyboard"
                      value={step.name || ''}
                      onChange={(e) => handleUpdateStep(step.id, 'name', e.target.value)}
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="label text-xs">Instructions Text</label>
                    <textarea
                      className="textarea"
                      rows={2}
                      placeholder="Disconnect cable from computer before cleaning..."
                      value={step.text || ''}
                      onChange={(e) => handleUpdateStep(step.id, 'text', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Step Deep-link URL</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="https://example.com/guide#step1"
                      value={step.url || ''}
                      onChange={(e) => handleUpdateStep(step.id, 'url', e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label text-xs">Step Image URL</label>
                    <input
                      type="url"
                      className="input"
                      placeholder="https://example.com/step1.jpg"
                      value={step.image || ''}
                      onChange={(e) => handleUpdateStep(step.id, 'image', e.target.value)}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddStep}
            className="btn btn-secondary text-sm py-2 px-4 font-bold mt-3"
          >
            + Add Step
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // LOCAL BUSINESS & RESTAURANT
  // ----------------------------------------------------
  if (schemaType === 'LocalBusiness' || schemaType === 'Restaurant') {
    const data = state as unknown as LocalBusinessFormState;
    const isRestaurant = schemaType === 'Restaurant' || data.subType === 'Restaurant';
    const sameAsText = (data.sameAs || []).join('\n');

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group">
          <label className="label">Specific Subtype</label>
          <select
            className="select"
            value={data.subType || (schemaType === 'Restaurant' ? 'Restaurant' : 'LocalBusiness')}
            onChange={(e) => onChange('subType', e.target.value)}
          >
            <option value="LocalBusiness">LocalBusiness (General)</option>
            <option value="Restaurant">Restaurant</option>
            <option value="Store">Store</option>
            <option value="Dentist">Dentist</option>
            <option value="MedicalClinic">MedicalClinic</option>
            <option value="ProfessionalService">ProfessionalService</option>
            <option value="AutomotiveBusiness">AutomotiveBusiness</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">
            Business Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Spice Symphony Bistro"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Describe your products, ambiance, or services..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Website URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Telephone</label>
          <input
            type="tel"
            className="input"
            placeholder="+91-22-26543210"
            value={data.telephone || ''}
            onChange={(e) => onChange('telephone', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Email Address</label>
          <input
            type="email"
            className="input"
            placeholder="contact@business.com"
            value={data.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Price Range</label>
          <input
            type="text"
            className="input"
            placeholder="$, $$, or ₹₹₹"
            value={data.priceRange || ''}
            onChange={(e) => onChange('priceRange', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Street Address</label>
          <input
            type="text"
            className="input"
            placeholder="12 Mahatma Gandhi Road"
            value={data.streetAddress || ''}
            onChange={(e) => onChange('streetAddress', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">City / Locality</label>
          <input
            type="text"
            className="input"
            placeholder="Mumbai"
            value={data.addressLocality || ''}
            onChange={(e) => onChange('addressLocality', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">State / Region</label>
          <input
            type="text"
            className="input"
            placeholder="Maharashtra"
            value={data.addressRegion || ''}
            onChange={(e) => onChange('addressRegion', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Postal Code</label>
          <input
            type="text"
            className="input"
            placeholder="400001"
            value={data.postalCode || ''}
            onChange={(e) => onChange('postalCode', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Country Code (ISO 2-letter)</label>
          <input
            type="text"
            className="input"
            placeholder="IN or US"
            value={data.addressCountry || ''}
            onChange={(e) => onChange('addressCountry', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Latitude (-90 to 90)</label>
          <input
            type="text"
            className="input"
            placeholder="18.9322"
            value={data.latitude || ''}
            onChange={(e) => onChange('latitude', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Longitude (-180 to 180)</label>
          <input
            type="text"
            className="input"
            placeholder="72.8335"
            value={data.longitude || ''}
            onChange={(e) => onChange('longitude', e.target.value)}
          />
        </div>

        {isRestaurant && (
          <>
            <div className="input-group">
              <label className="label">Serves Cuisine</label>
              <input
                type="text"
                className="input"
                placeholder="Indian, Mughlai, Coastal"
                value={data.servesCuisine || ''}
                onChange={(e) => onChange('servesCuisine', e.target.value)}
              />
            </div>
            <div className="input-group">
              <label className="label">Online Menu URL</label>
              <input
                type="url"
                className="input"
                placeholder="https://example.com/menu"
                value={data.menu || ''}
                onChange={(e) => onChange('menu', e.target.value)}
              />
            </div>
          </>
        )}

        <div className="input-group md:col-span-2">
          <label className="label">Social Profiles / sameAs (one URL per line)</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="https://instagram.com/business&#10;https://facebook.com/business"
            value={sameAsText}
            onChange={(e) =>
              onChange(
                'sameAs',
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
              )
            }
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // ORGANIZATION
  // ----------------------------------------------------
  if (schemaType === 'Organization') {
    const data = state as unknown as OrganizationFormState;
    const sameAsText = (data.sameAs || []).join('\n');

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group">
          <label className="label">
            Organization Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Indian Marketers"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Website URL <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="url"
            className="input"
            placeholder="https://indianmarketers.in"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Logo URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://indianmarketers.in/logo.png"
            value={data.logo || ''}
            onChange={(e) => onChange('logo', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Founding Date</label>
          <input
            type="text"
            className="input"
            placeholder="YYYY-MM-DD (e.g. 2020-01-15)"
            value={data.foundingDate || ''}
            onChange={(e) => onChange('foundingDate', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Email Address</label>
          <input
            type="email"
            className="input"
            placeholder="contact@indianmarketers.in"
            value={data.email || ''}
            onChange={(e) => onChange('email', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Customer Service Telephone</label>
          <input
            type="tel"
            className="input"
            placeholder="+91-98765-43210"
            value={data.telephone || ''}
            onChange={(e) => onChange('telephone', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description</label>
          <input
            type="text"
            className="input"
            placeholder="Premier digital marketing and technical SEO agency..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Social Profiles / sameAs (one URL per line)</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="https://twitter.com/indianmarketers&#10;https://linkedin.com/company/indianmarketers"
            value={sameAsText}
            onChange={(e) =>
              onChange(
                'sameAs',
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
              )
            }
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // PERSON
  // ----------------------------------------------------
  if (schemaType === 'Person') {
    const data = state as unknown as PersonFormState;
    const sameAsText = (data.sameAs || []).join('\n');

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group">
          <label className="label">
            Person Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Harsh Jha"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Official Profile / Website URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/team/harsh"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Profile Image URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/photos/harsh.jpg"
            value={data.image || ''}
            onChange={(e) => onChange('image', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Job Title</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Technical SEO Lead"
            value={data.jobTitle || ''}
            onChange={(e) => onChange('jobTitle', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Works For (Company Name)</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Indian Marketers"
            value={data.worksForName || ''}
            onChange={(e) => onChange('worksForName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Company URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://indianmarketers.in"
            value={data.worksForUrl || ''}
            onChange={(e) => onChange('worksForUrl', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Biography / Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Specializing in search crawlability, web architecture, and JavaScript SEO..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Social Profiles / sameAs (one URL per line)</label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="https://linkedin.com/in/username&#10;https://twitter.com/username"
            value={sameAsText}
            onChange={(e) =>
              onChange(
                'sameAs',
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter((s) => s.length > 0)
              )
            }
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // PRODUCT
  // ----------------------------------------------------
  if (schemaType === 'Product') {
    const data = state as unknown as ProductFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">
            Product Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. UltraBook Pro 16"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Detailed description of features, specifications..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Product Image URL <span className="text-amber-500 text-xs font-semibold">(Required for Google)</span>
          </label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/product.jpg"
            value={data.image || ''}
            onChange={(e) => onChange('image', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Brand Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. TechCraft"
            value={data.brand || ''}
            onChange={(e) => onChange('brand', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">SKU</label>
          <input
            type="text"
            className="input"
            placeholder="UB-16-512"
            value={data.sku || ''}
            onChange={(e) => onChange('sku', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">GTIN / Barcode (UPC, EAN, ISBN)</label>
          <input
            type="text"
            className="input"
            placeholder="01234567890128"
            value={data.gtin || ''}
            onChange={(e) => onChange('gtin', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Price Amount</label>
          <input
            type="number"
            step="0.01"
            className="input"
            placeholder="e.g. 149999 or 999.00"
            value={data.price || ''}
            onChange={(e) => onChange('price', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Currency (ISO 4217 code)</label>
          <input
            type="text"
            className="input"
            placeholder="INR, USD, EUR, GBP"
            value={data.priceCurrency || ''}
            onChange={(e) => onChange('priceCurrency', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Availability</label>
          <select
            className="select"
            value={data.availability || 'InStock'}
            onChange={(e) => onChange('availability', e.target.value)}
          >
            <option value="InStock">InStock</option>
            <option value="OutOfStock">OutOfStock</option>
            <option value="PreOrder">PreOrder</option>
            <option value="BackOrder">BackOrder</option>
            <option value="Discontinued">Discontinued</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">Item Condition</label>
          <select
            className="select"
            value={data.itemCondition || 'NewCondition'}
            onChange={(e) => onChange('itemCondition', e.target.value)}
          >
            <option value="NewCondition">NewCondition</option>
            <option value="UsedCondition">UsedCondition</option>
            <option value="RefurbishedCondition">RefurbishedCondition</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">Average Rating (1 to 5)</label>
          <input
            type="number"
            step="0.1"
            min="1"
            max="5"
            className="input"
            placeholder="4.8"
            value={data.ratingValue || ''}
            onChange={(e) => onChange('ratingValue', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Review Count</label>
          <input
            type="number"
            min="1"
            className="input"
            placeholder="124"
            value={data.reviewCount || ''}
            onChange={(e) => onChange('reviewCount', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // EVENT
  // ----------------------------------------------------
  if (schemaType === 'Event') {
    const data = state as unknown as EventFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">
            Event Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. International SEO Summit 2026"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Start Date/Time (ISO 8601) <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="2026-11-20T09:30:00+05:30"
            value={data.startDate || ''}
            onChange={(e) => onChange('startDate', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">End Date/Time (ISO 8601)</label>
          <input
            type="text"
            className="input"
            placeholder="2026-11-21T18:00:00+05:30"
            value={data.endDate || ''}
            onChange={(e) => onChange('endDate', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Attendance Mode</label>
          <select
            className="select"
            value={data.eventAttendanceMode || 'OfflineEventAttendanceMode'}
            onChange={(e) => onChange('eventAttendanceMode', e.target.value)}
          >
            <option value="OfflineEventAttendanceMode">In-Person (Offline Physical)</option>
            <option value="OnlineEventAttendanceMode">Online / Virtual</option>
            <option value="MixedEventAttendanceMode">Hybrid (Physical & Online)</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">Event Status</label>
          <select
            className="select"
            value={data.eventStatus || 'EventScheduled'}
            onChange={(e) => onChange('eventStatus', e.target.value)}
          >
            <option value="EventScheduled">Scheduled</option>
            <option value="EventPostponed">Postponed</option>
            <option value="EventRescheduled">Rescheduled</option>
            <option value="EventCancelled">Cancelled</option>
          </select>
        </div>

        <div className="input-group">
          <label className="label">Venue / Location Name</label>
          <input
            type="text"
            className="input"
            placeholder="Jio World Convention Centre"
            value={data.locationName || ''}
            onChange={(e) => onChange('locationName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Virtual Stream URL (For Online Events)</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/stream"
            value={data.virtualLocationUrl || ''}
            onChange={(e) => onChange('virtualLocationUrl', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">City / Locality</label>
          <input
            type="text"
            className="input"
            placeholder="Mumbai"
            value={data.addressLocality || ''}
            onChange={(e) => onChange('addressLocality', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Country (2-letter code)</label>
          <input
            type="text"
            className="input"
            placeholder="IN"
            value={data.addressCountry || ''}
            onChange={(e) => onChange('addressCountry', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Ticket Price</label>
          <input
            type="number"
            className="input"
            placeholder="4999"
            value={data.ticketPrice || ''}
            onChange={(e) => onChange('ticketPrice', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Currency Code</label>
          <input
            type="text"
            className="input"
            placeholder="INR"
            value={data.ticketCurrency || ''}
            onChange={(e) => onChange('ticketCurrency', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // BREADCRUMBLIST
  // ----------------------------------------------------
  if (schemaType === 'BreadcrumbList') {
    const data = state as unknown as BreadcrumbFormState;
    const items = data.items || [];

    const handleAddItem = () => {
      onChange('items', [...items, { id: generateRowId(), name: '', url: '' }]);
    };

    const handleRemoveItem = (id: string) => {
      onChange(
        'items',
        items.filter((item) => item.id !== id)
      );
    };

    const handleMoveItem = (index: number, direction: 'up' | 'down') => {
      const targetIndex = direction === 'up' ? index - 1 : index + 1;
      if (targetIndex < 0 || targetIndex >= items.length) return;
      const copy = [...items];
      const temp = copy[index];
      copy[index] = copy[targetIndex];
      copy[targetIndex] = temp;
      onChange('items', copy);
    };

    const handleUpdateItem = (id: string, field: 'name' | 'url', val: string) => {
      onChange(
        'items',
        items.map((item) => (item.id === id ? { ...item, [field]: val } : item))
      );
    };

    return (
      <div className="space-y-4 mt-6">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Breadcrumbs represent the hierarchical trail of the current page. Positions (1, 2, 3...) are automatically calculated based on the order shown.
        </p>

        <div className="space-y-3">
          {items.map((item, index) => (
            <div
              key={item.id}
              className="p-4 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex flex-col md:flex-row gap-3 items-center"
            >
              <span className="w-8 h-8 rounded-full bg-green-100 text-green-800 font-extrabold flex items-center justify-center text-sm shrink-0">
                {index + 1}
              </span>
              <div className="flex-1 w-full grid md:grid-cols-2 gap-3">
                <input
                  type="text"
                  className="input py-2 text-sm"
                  placeholder="Page Name (e.g. SEO Tools)"
                  value={item.name}
                  onChange={(e) => handleUpdateItem(item.id, 'name', e.target.value)}
                />
                <input
                  type="url"
                  className="input py-2 text-sm"
                  placeholder="Canonical URL (e.g. https://example.com/tools)"
                  value={item.url}
                  onChange={(e) => handleUpdateItem(item.id, 'url', e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={index === 0}
                  onClick={() => handleMoveItem(index, 'up')}
                  className="p-2 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs font-bold disabled:opacity-30"
                  title="Move Up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  disabled={index === items.length - 1}
                  onClick={() => handleMoveItem(index, 'down')}
                  className="p-2 rounded bg-white dark:bg-slate-700 border border-slate-300 dark:border-slate-600 text-xs font-bold disabled:opacity-30"
                  title="Move Down"
                >
                  ↓
                </button>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveItem(item.id)}
                    className="p-2 rounded bg-rose-50 text-rose-700 border border-rose-200 text-xs font-bold"
                    title="Delete item"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={handleAddItem}
          className="btn btn-secondary text-sm py-2.5 px-4 font-bold"
        >
          + Add Breadcrumb Level
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // RECIPE
  // ----------------------------------------------------
  if (schemaType === 'Recipe') {
    const data = state as unknown as RecipeFormState;
    const ingredientsText = (data.ingredients || []).join('\n');
    const instructions = data.instructions || [];

    const handleAddInstruction = () => {
      onChange('instructions', [
        ...instructions,
        { id: generateRowId(), name: '', text: '' },
      ]);
    };

    const handleRemoveInstruction = (id: string) => {
      onChange(
        'instructions',
        instructions.filter((i) => i.id !== id)
      );
    };

    const handleUpdateInstruction = (id: string, text: string) => {
      onChange(
        'instructions',
        instructions.map((i) => (i.id === id ? { ...i, text } : i))
      );
    };

    return (
      <div className="space-y-6 mt-6">
        <div className="grid md:grid-cols-2 gap-4">
          <div className="input-group md:col-span-2">
            <label className="label">
              Recipe Name <span className="text-red-500 font-bold">*</span>
            </label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Authentic Masala Chai"
              value={data.name || ''}
              onChange={(e) => onChange('name', e.target.value)}
            />
          </div>

          <div className="input-group md:col-span-2">
            <label className="label">Description</label>
            <textarea
              className="textarea"
              rows={2}
              placeholder="Aromatic description of the dish..."
              value={data.description || ''}
              onChange={(e) => onChange('description', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Author Name</label>
            <input
              type="text"
              className="input"
              placeholder="Chef Aarti Sharma"
              value={data.authorName || ''}
              onChange={(e) => onChange('authorName', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">
              Image URL <span className="text-amber-500 text-xs font-semibold">(Recommended)</span>
            </label>
            <input
              type="url"
              className="input"
              placeholder="https://example.com/chai.jpg"
              value={data.image || ''}
              onChange={(e) => onChange('image', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Prep Time</label>
            <input
              type="text"
              className="input"
              placeholder="5 mins or PT5M"
              value={data.prepTime || ''}
              onChange={(e) => onChange('prepTime', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Cook Time</label>
            <input
              type="text"
              className="input"
              placeholder="10 mins or PT10M"
              value={data.cookTime || ''}
              onChange={(e) => onChange('cookTime', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Recipe Yield</label>
            <input
              type="text"
              className="input"
              placeholder="2 servings or 4 cups"
              value={data.recipeYield || ''}
              onChange={(e) => onChange('recipeYield', e.target.value)}
            />
          </div>

          <div className="input-group">
            <label className="label">Calories</label>
            <input
              type="text"
              className="input"
              placeholder="95 calories"
              value={data.calories || ''}
              onChange={(e) => onChange('calories', e.target.value)}
            />
          </div>

          <div className="input-group md:col-span-2">
            <label className="label">Ingredients (one per line)</label>
            <textarea
              className="textarea"
              rows={4}
              placeholder="1 cup water&#10;1 cup whole milk&#10;2 tsp Assam tea"
              value={ingredientsText}
              onChange={(e) =>
                onChange(
                  'ingredients',
                  e.target.value
                    .split('\n')
                    .map((s) => s.trim())
                    .filter((s) => s.length > 0)
                )
              }
            />
          </div>
        </div>

        <div>
          <h3 className="font-bold text-base mb-3 text-slate-800 dark:text-slate-200">
            Instructions / Preparation Steps
          </h3>
          <div className="space-y-3">
            {instructions.map((step, idx) => (
              <div
                key={step.id}
                className="p-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl flex gap-3 items-start"
              >
                <span className="font-black text-sm text-green-700 pt-2 shrink-0">#{idx + 1}</span>
                <textarea
                  className="textarea flex-1 text-sm py-2"
                  rows={2}
                  placeholder={`Step ${idx + 1} instructions...`}
                  value={step.text}
                  onChange={(e) => handleUpdateInstruction(step.id, e.target.value)}
                />
                {instructions.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveInstruction(step.id)}
                    className="text-xs text-rose-600 hover:text-rose-800 font-bold px-2 py-1 rounded bg-rose-50 border border-rose-200 mt-2 shrink-0"
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddInstruction}
            className="btn btn-secondary text-sm py-2 px-4 font-bold mt-3"
          >
            + Add Instruction Step
          </button>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // VIDEO OBJECT
  // ----------------------------------------------------
  if (schemaType === 'VideoObject') {
    const data = state as unknown as VideoFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">
            Video Title <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. How to Fix Crawl Budget Bottlenecks"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">
            Description <span className="text-red-500 font-bold">*</span>
          </label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Overview of what the video covers..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Thumbnail URL <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/thumb.jpg"
            value={data.thumbnailUrl || ''}
            onChange={(e) => onChange('thumbnailUrl', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Upload Date <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="YYYY-MM-DD"
            value={data.uploadDate || ''}
            onChange={(e) => onChange('uploadDate', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Duration (ISO 8601 or natural)</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. 14 mins or PT14M"
            value={data.duration || ''}
            onChange={(e) => onChange('duration', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Embed URL (e.g. YouTube embed)</label>
          <input
            type="url"
            className="input"
            placeholder="https://www.youtube.com/embed/VIDEO_ID"
            value={data.embedUrl || ''}
            onChange={(e) => onChange('embedUrl', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // JOB POSTING
  // ----------------------------------------------------
  if (schemaType === 'JobPosting') {
    const data = state as unknown as JobPostingFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">
            Job Title <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Senior Technical SEO Specialist"
            value={data.title || ''}
            onChange={(e) => onChange('title', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">
            Description <span className="text-red-500 font-bold">*</span>
          </label>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Job requirements, role summary, qualifications..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Hiring Organization <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Indian Marketers"
            value={data.hiringOrganizationName || ''}
            onChange={(e) => onChange('hiringOrganizationName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Company Website URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://indianmarketers.in"
            value={data.hiringOrganizationUrl || ''}
            onChange={(e) => onChange('hiringOrganizationUrl', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Date Posted <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="YYYY-MM-DD"
            value={data.datePosted || ''}
            onChange={(e) => onChange('datePosted', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Valid Through (Expiry Date)</label>
          <input
            type="text"
            className="input"
            placeholder="YYYY-MM-DD"
            value={data.validThrough || ''}
            onChange={(e) => onChange('validThrough', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Employment Type</label>
          <select
            className="select"
            value={data.employmentType || 'FULL_TIME'}
            onChange={(e) => onChange('employmentType', e.target.value)}
          >
            <option value="FULL_TIME">Full Time</option>
            <option value="PART_TIME">Part Time</option>
            <option value="CONTRACTOR">Contractor</option>
            <option value="TEMPORARY">Temporary</option>
            <option value="INTERN">Intern</option>
          </select>
        </div>

        <div className="input-group flex items-center gap-3 pt-6">
          <label className="inline-flex items-center gap-2 cursor-pointer font-bold text-sm">
            <input
              type="checkbox"
              className="w-5 h-5 rounded text-green-600 focus:ring-green-500"
              checked={data.isRemote || false}
              onChange={(e) => onChange('isRemote', e.target.checked)}
            />
            <span>100% Remote Position (Telecommute)</span>
          </label>
        </div>

        <div className="input-group">
          <label className="label">Base Salary Amount</label>
          <input
            type="number"
            className="input"
            placeholder="e.g. 1800000"
            value={data.baseSalary || ''}
            onChange={(e) => onChange('baseSalary', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Salary Currency</label>
          <input
            type="text"
            className="input"
            placeholder="INR or USD"
            value={data.salaryCurrency || ''}
            onChange={(e) => onChange('salaryCurrency', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // WEBSITE
  // ----------------------------------------------------
  if (schemaType === 'WebSite') {
    const data = state as unknown as WebSiteFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group">
          <label className="label">
            WebSite Name <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="text"
            className="input"
            placeholder="e.g. Indian Marketers"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">
            Canonical URL <span className="text-red-500 font-bold">*</span>
          </label>
          <input
            type="url"
            className="input"
            placeholder="https://indianmarketers.in"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Internal Search Action URL Template (Optional Sitelinks Searchbox)</label>
          <input
            type="text"
            className="input"
            placeholder="https://indianmarketers.in/search?q={search_term_string}"
            value={data.searchActionTarget || ''}
            onChange={(e) => onChange('searchActionTarget', e.target.value)}
          />
          <p className="text-xs text-slate-500 mt-1">
            Example: https://example.com/search?q={'{search_term_string}'}
          </p>
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // WEBPAGE
  // ----------------------------------------------------
  if (schemaType === 'WebPage') {
    const data = state as unknown as WebPageFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group">
          <label className="label">Page Name / Title</label>
          <input
            type="text"
            className="input"
            placeholder="Schema Markup Generator"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Canonical Page URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/tools/schema"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Page Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Description of the webpage content..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SOFTWARE APPLICATION
  // ----------------------------------------------------
  if (schemaType === 'SoftwareApplication') {
    const data = state as unknown as SoftwareAppFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">Application Name</label>
          <input
            type="text"
            className="input"
            placeholder="e.g. SEO Crawler Pro"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Application Category</label>
          <input
            type="text"
            className="input"
            placeholder="DeveloperApplication or BusinessApplication"
            value={data.applicationCategory || ''}
            onChange={(e) => onChange('applicationCategory', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Operating System</label>
          <input
            type="text"
            className="input"
            placeholder="Windows, macOS, Linux, Web"
            value={data.operatingSystem || ''}
            onChange={(e) => onChange('operatingSystem', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Price</label>
          <input
            type="number"
            className="input"
            placeholder="0 for Free"
            value={data.price || ''}
            onChange={(e) => onChange('price', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Currency</label>
          <input
            type="text"
            className="input"
            placeholder="USD"
            value={data.priceCurrency || ''}
            onChange={(e) => onChange('priceCurrency', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // COURSE
  // ----------------------------------------------------
  if (schemaType === 'Course') {
    const data = state as unknown as CourseFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">Course Name</label>
          <input
            type="text"
            className="input"
            placeholder="Advanced Technical SEO Masterclass"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Comprehensive course syllabus and details..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Provider Organization Name</label>
          <input
            type="text"
            className="input"
            placeholder="Indian Marketers Academy"
            value={data.providerName || ''}
            onChange={(e) => onChange('providerName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Course Code / Identifier</label>
          <input
            type="text"
            className="input"
            placeholder="SEO-401"
            value={data.courseCode || ''}
            onChange={(e) => onChange('courseCode', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // DATASET
  // ----------------------------------------------------
  if (schemaType === 'Dataset') {
    const data = state as unknown as DatasetFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">Dataset Name</label>
          <input
            type="text"
            className="input"
            placeholder="Global Web Search Crawlers Database"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Detailed description of columns, methods, and dataset coverage..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Dataset URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/datasets/crawlers"
            value={data.url || ''}
            onChange={(e) => onChange('url', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Direct Download URL</label>
          <input
            type="url"
            className="input"
            placeholder="https://example.com/datasets/crawlers.json"
            value={data.distributionDownloadUrl || ''}
            onChange={(e) => onChange('distributionDownloadUrl', e.target.value)}
          />
        </div>
      </div>
    );
  }

  // ----------------------------------------------------
  // SERVICE
  // ----------------------------------------------------
  if (schemaType === 'Service') {
    const data = state as unknown as ServiceFormState;

    return (
      <div className="grid md:grid-cols-2 gap-4 mt-6">
        <div className="input-group md:col-span-2">
          <label className="label">Service Name</label>
          <input
            type="text"
            className="input"
            placeholder="Enterprise Technical SEO Consulting"
            value={data.name || ''}
            onChange={(e) => onChange('name', e.target.value)}
          />
        </div>

        <div className="input-group md:col-span-2">
          <label className="label">Description</label>
          <textarea
            className="textarea"
            rows={2}
            placeholder="Comprehensive SEO audits, rendering solutions, and structured data..."
            value={data.description || ''}
            onChange={(e) => onChange('description', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Service Type</label>
          <input
            type="text"
            className="input"
            placeholder="Technical SEO Consulting"
            value={data.serviceType || ''}
            onChange={(e) => onChange('serviceType', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Provider Name</label>
          <input
            type="text"
            className="input"
            placeholder="Indian Marketers"
            value={data.providerName || ''}
            onChange={(e) => onChange('providerName', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Price Amount</label>
          <input
            type="number"
            className="input"
            placeholder="2500"
            value={data.price || ''}
            onChange={(e) => onChange('price', e.target.value)}
          />
        </div>

        <div className="input-group">
          <label className="label">Currency Code</label>
          <input
            type="text"
            className="input"
            placeholder="USD"
            value={data.priceCurrency || ''}
            onChange={(e) => onChange('priceCurrency', e.target.value)}
          />
        </div>
      </div>
    );
  }

  return null;
}
