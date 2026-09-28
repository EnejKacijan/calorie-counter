import { mountPackageScan } from "./package-scan.js?v=15";
import { createSheetSurface } from "./mobile-surface.js?v=3";
import { localRecordId } from "./local-record-id.js?v=1";
import { decimalValue, validateFoodEntry, validateExerciseEntry, commitDiaryDay } from "./add-entry.js?v=1";
import { createAddSurface, animateFoodStep } from "./add-surface.js?v=16";
import { bindSemanticBack } from "./semantic-back.js?v=4";
import { groupDiaryFoods, diaryMealLabel, latestReusableDay } from "./today-diary.js?v=3";
import { rankFoodMatches, foodBrandLabel, foodActionLabel, foodSearchErrorMessage, foodResultMetadata } from "./food-search.js?v=2";
import { formatFoodDisplayName } from './food-display-name.js?v=1';
import { savedPhotoDefinition, mediaIdValid } from './food-media.js?v=2';
import { foodMedia, withFoodPhotos, collectFoodMediaSoon, foodPhotoNotice, hasRecoverablePhoto } from './food-media-runtime.js?v=2';
import { createFoodPhotoViewer, createFoodThumbnails, createPhotoEditor } from './food-photo-ui.js?v=7';
import { captureContext, captureBlocks, sharedPlateCover, createCaptureDraft } from './plate-capture.js?v=1';
import { bindScannedMealDisclosure } from './scanned-meal-group.js?v=2';
import { createDisclosureReveal, disclosureScrollOwner, disclosureRegion } from './disclosure-reveal.js?v=1';
import { bindCalendarSwipe } from './calendar-swipe.js?v=2';
import { createPeerTabs } from './peer-tabs.js?v=4';
import { createDiaryRowSwipe, collapseDiaryFoodRow } from './diary-row-swipe.js?v=3';
export function mountPage({ localStorage, window, document, setTimeout, clearTimeout, setInterval, clearInterval, requestAnimationFrame, cancelAnimationFrame, ResizeObserver, MutationObserver, fetch, isActive, onDispose, viewState = {} }) {
const scanner = mountPackageScan({ document, window, fetch, isActive, onDispose, prepareParent: () => addSurface.prepareChild(), resizeImage: file => resizeImageForAnalysis(file), onFoodAnalysis: (analysis, image, sourcePhoto, session) => {
  scanPhotoSession = session;
  captureDraft.clear();
  scanEditingFoodId = null;
  scanDraftGeneration++;
  photoEditor.reset({ foodName: 'your plate', normalized: session?.normalized, previewOnly: true });
  if (!session?.normalized && sourcePhoto) photoEditor.load(sourcePhoto);
  showSimpleScannedPlate(analysis, image, { inputMode: "photo" });
  animateFoodStep(elements.foodSection.querySelector('.add-flow-content'), 'forward', window);
}, onManual: () => elements.scanNoFoodManual.click(), onFood: (food, label) => {
  leaveNoFoodResult();
  scannedFoodItems = []; scannedFoodAnalysis = null;
  elements.openScanReview.hidden = true;
  elements.foodSection.classList.remove("is-reviewing-scan", "is-reviewing-text-estimate");
  elements.scanReview.hidden = true;
  const measuredLabel = label && (food.servingGrams > 0 || food.servingMl > 0);
  fillManualFood(measuredLabel ? { ...food, lastUsedAmount: food.servingGrams || food.servingMl, lastUsedUnit: food.servingGrams ? "g" : "ml" } : food, { editableName: label, fromScanner: true });
  syncFoodDetailBrand(food);
  elements.foodEditSummary.querySelector("span").textContent = label ? "Nutrition label · AI transcription" : "Barcode product";
  elements.foodEditSummary.querySelector("small").textContent = label
    ? `Label values ${food.serving}. Check the transcription and your amount before adding.`
    : `${food.serving || "1 serving"}. Review your amount and meal before adding.`;
} });
const macroConfig = [
  {
    key: "protein",
    label: "Protein",
    unit: "g",
    color: "var(--mint-dark)",
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M14 16h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3Zm15 0h5a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3h-5a3 3 0 0 1-3-3V19a3 3 0 0 1 3-3Z" fill="currentColor" opacity=".22"/><path d="M18 24h12" fill="none" stroke="currentColor" stroke-width="5" stroke-linecap="round"/><path d="M10 20v8M38 20v8M15 18v12M33 18v12" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>`,
  },
  {
    key: "carbs",
    label: "Carbs",
    unit: "g",
    color: "var(--lemon)",
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 8v33" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/><path d="M24 18c-5.9-.2-10.2-3.2-11.4-8.6C18.3 9.4 22.5 12.3 24 18Zm0 8c-5.9-.2-10.2-3.2-11.4-8.6C18.3 17.4 22.5 20.3 24 26Zm0 8c-5.9-.2-10.2-3.2-11.4-8.6C18.3 25.4 22.5 28.3 24 34Zm0-16c5.9-.2 10.2-3.2 11.4-8.6C29.7 9.4 25.5 12.3 24 18Zm0 8c5.9-.2 10.2-3.2 11.4-8.6C29.7 17.4 25.5 20.3 24 26Zm0 8c5.9-.2 10.2-3.2 11.4-8.6C29.7 25.4 25.5 28.3 24 34Z" fill="currentColor" opacity=".82"/></svg>`,
  },
  {
    key: "fat",
    label: "Fat",
    unit: "g",
    color: "var(--berry)",
    icon: `<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M24 6S12 19.7 12 30c0 7.6 5.4 13 12 13s12-5.4 12-13C36 19.7 24 6 24 6Z" fill="currentColor" opacity=".22"/><path d="M24 11.5S16.2 22.1 16.2 30c0 5.1 3.3 8.4 7.8 8.4s7.8-3.3 7.8-8.4c0-7.9-7.8-18.5-7.8-18.5Zm-3.6 20.7c-.7 0-1.2-.5-1.2-1.2 0-3.2 1.6-6.5 3.5-9.2.4-.5 1.1-.7 1.7-.3.5.4.7 1.1.3 1.7-2.1 3.1-3.1 5.8-3.1 7.8 0 .7-.5 1.2-1.2 1.2Z" fill="currentColor"/></svg>`,
  },
];

const defaults = {
  user: null,
  theme: localStorage.getItem("calorie-counter-theme") || "light",
  goals: { calories: 2300, protein: 150, carbs: 260, fat: 75 },
  selectedDate: localDateKey(new Date()),
  lastOpenedDate: localDateKey(new Date()),
  progress: [],
  days: {},
};

const foodLibraryKey = "calorie-counter-food-library";
const savedFoodLibraryKey = "calorie-counter-saved-foods";
const savedMealLibraryKey = "calorie-counter-saved-meals";
const savedFoodMigrationKey = "calorie-counter-saved-foods-v2";
const appSessionKey = "calorie-counter-today-session-v1";
const foodReuse = window.IntakeFoodReuse;
const foodPersistence = window.IntakeFoodPersistence;
const mealSchedule = window.IntakeMealSchedule;
const portionMath = window.IntakeScannedFood;
let isFreshAppLaunch = true;
let calendarSwipe = null;

try {
  isFreshAppLaunch = sessionStorage.getItem(appSessionKey) !== "active";
  sessionStorage.setItem(appSessionKey, "active");
} catch {
  // If session storage is unavailable, selecting today on load is the safe fallback.
  isFreshAppLaunch = true;
}
const maxRecentFoodItems = foodPersistence?.MAX_RECENT_FOODS || 100;
const stapleFoodLibrary = [
  { id: "usda-chicken-breast-grilled", name: "Chicken breast, grilled", brand: "USDA", source: "USDA", serving: "per 100g", calories: 165, protein: 31, carbs: 0, fat: 4 },
  { id: "usda-chicken-thigh-roasted", name: "Chicken thigh, roasted", brand: "USDA", source: "USDA", serving: "per 100g", calories: 209, protein: 26, carbs: 0, fat: 11 },
  { id: "off-chickpeas-canned", name: "Chickpeas, canned", brand: "Open Food Facts", source: "Open Food Facts", serving: "per 100g", calories: 119, protein: 6, carbs: 19, fat: 2 },
  { id: "my-chicken-caesar-wrap", name: "Chicken caesar wrap", brand: "My foods", source: "Saved", serving: "per 1 wrap", calories: 482, protein: 32, carbs: 42, fat: 20 },
  { id: "usda-chicken-stock-low-sodium", name: "Chicken stock, low sodium", brand: "USDA", source: "USDA", serving: "per 240ml", calories: 38, protein: 5, carbs: 2, fat: 1 },
];

const exercisePresets = {
  Running: { minutes: 60, met: 9.8 },
  "Weight lifting": { minutes: 45, met: 5 },
  Cycling: { minutes: 60, met: 7.5 },
  Walking: { minutes: 45, met: 3.5 },
};

let state = loadState();
let foodLibrary = loadFoodLibrary();
let savedFoods = loadSavedFoods();
let savedMeals = loadSavedMeals();
let suggestionAbortController = null;
let foodSearchRequestId = 0;
let foodSearchPending = false;
let foodSearchError = "";
let autocompleteTimer = null;
let selectedFoodBase = null;
let editingFoodId = null;
let foodNutritionOverridden = false;
let foodNutritionEditing = false;
let editingExerciseId = null;
let exerciseCaloriesOverridden = false;
let foodSearchFilter = "all";
let latestFoodSuggestions = [];
let foodSuggestionVisibleCount = 5;
let scannedFoodItems = [];
let scannedFoodAnalysis = null;
let scanPhotoSession = null, scanEditingFoodId = null, scanDraftGeneration = 0;
let scanCorrectionController = null;
let plateSummaryScroll = 0;
let scanRemovedFoodId = null;
let aiDescriptionPending = false;
let aiDescriptionController = null;
let undoToastTimer = null;
let renderSnapshot = null;
let recentSuccess = null;
let successCueTimer = null;
const modalOpeners = new WeakMap();
const addSurface = createAddSurface(window);
onDispose(() => { if(foodReuseState.open || reuseSheet?.active)closeFoodReusePanel({restoreFocus:false,immediate:true});addSurface.dispose(); });
let pausedFoodSearch = false;
let foodReuseState = { open: false, view: "menu", sourceDate: "", selectedMeal: "", savedMealId: "" };
let foodReuseOpener = null;
let reuseSheet;
const elements = {
  appShell: document.querySelector(".app-shell"),
  mainContent: document.querySelector(".main-content"),
  sidebarToggle: document.querySelector("#sidebarToggle"),
  mobileMenuButton: document.querySelector("#mobileMenuButton"),
  sidebarBackdrop: document.querySelector("#sidebarBackdrop"),
  floatingAddButton: document.querySelector("#floatingAddButton"),
  fabOverlay: document.querySelector("#fabOverlay"),
  fabActions: document.querySelector("#fabActions"),
  fabSheetClose: document.querySelector("#fabSheetClose"),
  fabAddFood: document.querySelector("#fabAddFood"),
  fabScanFood: document.querySelector("#fabScanFood"),
  fabAddExercise: document.querySelector("#fabAddExercise"),
  fabSavedFoods: document.querySelector("#fabSavedFoods"),
  floatingScanButton: document.querySelector("#floatingScanButton"),
  mobileFoodsTab: document.querySelector("#mobileFoodsTab"),
  appTitle: document.querySelector("#appTitle"),
  profileSummary: document.querySelector("#profileSummary"),
  profileMeta: document.querySelector("#profileMeta"),
  profileInitials: document.querySelector("#profileInitials"),
  selectedDateLabel: document.querySelector("#selectedDateLabel"),
  todayButton: document.querySelector("#todayButton"),
  calendarStrip: document.querySelector("#calendarStrip"),
  previousWeekButton: document.querySelector("#previousWeekButton"),
  nextWeekButton: document.querySelector("#nextWeekButton"),
  remainingCalories: document.querySelector("#remainingCalories"),
  goalHelper: document.querySelector("#goalHelper"),
  foodCaloriesTotal: document.querySelector("#foodCaloriesTotal"),
  exerciseCaloriesTotal: document.querySelector("#exerciseCaloriesTotal"),
  netCaloriesTotal: document.querySelector("#netCaloriesTotal"),
  consumedCalories: document.querySelector("#consumedCalories"),
  goalCaloriesText: document.querySelector("#goalCaloriesText"),
  ringCopy: document.querySelector(".ring-copy"),
  goalStatus: document.querySelector("#goalStatus"),
  calorieRing: document.querySelector("#calorieRing"),
  macroGrid: document.querySelector("#macroGrid"),
  foodSection: document.querySelector("#foodSection"),
  foodModeEyebrow: document.querySelector("#foodModeEyebrow"),
  foodModeTitle: document.querySelector("#foodModeTitle"),
  foodMobileHeaderTitle: document.querySelector("#foodMobileHeaderTitle"),
  cancelFoodEdit: document.querySelector("#cancelFoodEdit"),
  addFoodToggle: document.querySelector("#addFoodToggle"),
  closeFoodModal: document.querySelector("#closeFoodModal"),
  backFoodModal: document.querySelector("#backFoodModal"),
  manualFoodForm: document.querySelector("#manualFoodForm"),
  manualFoodName: document.querySelector("#manualFoodName"),
  foodNameLabel: document.querySelector(".food-name-field > span"),
  foodEditName: document.querySelector("#foodEditName"),
  foodEditSummary: document.querySelector("#foodEditSummary"),
  openScanReview: document.querySelector("#openScanReview"),
  foodAmount: document.querySelector("#foodAmount"),
  foodUnit: document.querySelector("#foodUnit"),
  foodMeal: document.querySelector("#foodMeal"),
  foodPortionNote: document.querySelector("#foodPortionNote"),
  foodNutritionSummary: document.querySelector("#foodNutritionSummary"),
  foodNutritionGrid: document.querySelector("#foodNutritionGrid"),
  editFoodNutrition: document.querySelector("#editFoodNutrition"),
  foodNutritionAction: document.querySelector("#foodNutritionAction"),
  foodNutritionEditor: document.querySelector("#foodNutritionEditor"),
  foodNutritionCalories: document.querySelector("#foodNutritionCalories"),
  foodNutritionProtein: document.querySelector("#foodNutritionProtein"),
  foodNutritionCarbs: document.querySelector("#foodNutritionCarbs"),
  foodNutritionFat: document.querySelector("#foodNutritionFat"),
  manualFoodCalories: document.querySelector("#manualFoodCalories"),
  manualFoodProtein: document.querySelector("#manualFoodProtein"),
  manualFoodCarbs: document.querySelector("#manualFoodCarbs"),
  manualFoodFat: document.querySelector("#manualFoodFat"),
  manualFoodSubmit: document.querySelector("#manualFoodSubmit"),
  foodEditActions: document.querySelector("#foodEditActions"),
  deleteFoodEdit: document.querySelector("#deleteFoodEdit"),
  foodScanButton: document.querySelector("#foodScanButton"),
  foodFilterBar: document.querySelector(".food-filter-tabs"),
  foodFilterTabs: Array.from(document.querySelectorAll("[data-food-filter]")),
  addModeButtons: Array.from(document.querySelectorAll("[data-add-mode]")),
  foodAiDescriptionTrigger: document.querySelector("#foodAiDescriptionTrigger"),
  foodAiDescription: document.querySelector("#foodAiDescription"),
  foodAiDescriptionInput: document.querySelector("#foodAiDescriptionInput"),
  foodAiDescriptionStatus: document.querySelector("#foodAiDescriptionStatus"),
  foodAiDescriptionError: document.querySelector("#foodAiDescriptionError"),
  foodAiDescriptionRetry: document.querySelector("#foodAiDescriptionRetry"),
  foodAiDescriptionManual: document.querySelector("#foodAiDescriptionManual"),
  foodAiDescriptionBack: document.querySelector("#foodAiDescriptionBack"),
  foodAiDescriptionSubmit: document.querySelector("#foodAiDescriptionSubmit"),
  foodPhotoStatus: document.querySelector("#foodPhotoStatus"),
  scanReview: document.querySelector("#scanReview"),
  scanReviewEyebrow: document.querySelector("#scanReviewEyebrow"),
  scanReviewTitle: document.querySelector("#scanReviewTitle"),
  scanReviewDescription: document.querySelector("#scanReviewDescription"),
  scanReviewHeadingActions: document.querySelector(".scan-review-heading-actions"),
  scanNoFood: document.querySelector("#scanNoFood"),
  scanNoFoodRetry: document.querySelector("#scanNoFoodRetry"),
  scanNoFoodManual: document.querySelector("#scanNoFoodManual"),
  scanFoodList: document.querySelector("#scanFoodList"),
  scanReviewMeal: document.querySelector("#scanReviewMeal"),
  closeScanReview: document.querySelector("#closeScanReview"),
  scanSelectedCount: document.querySelector("#scanSelectedCount"),
  scanTotalCalories: document.querySelector("#scanTotalCalories"),
  scanTotalProtein: document.querySelector("#scanTotalProtein"),
  scanTotalCarbs: document.querySelector("#scanTotalCarbs"),
  scanTotalFat: document.querySelector("#scanTotalFat"),
  scanAddSelectedFoods: document.querySelector("#scanAddSelectedFoods"),
  scanReviewFooter: document.querySelector(".scan-review-footer"),
  scanSimpleSaveActions: document.querySelector("#scanSimpleSaveActions"),
  scanSaveAsMeal: document.querySelector("#scanSaveAsMeal"),
  scanSaveMealStatus: document.querySelector("#scanSaveMealStatus"),
  foodLogOptionsButton: document.querySelector("#foodLogOptionsButton"),
  foodReuseBackdrop: document.querySelector("#foodReuseBackdrop"),
  foodReusePanel: document.querySelector("#foodReusePanel"),
  foodReuseDragZone: document.querySelector("#foodReuseDragZone"),
  foodReuseBack: document.querySelector("#foodReuseBack"),
  foodReuseClose: document.querySelector("#foodReuseClose"),
  foodReuseEyebrow: document.querySelector("#foodReuseEyebrow"),
  foodReuseTitle: document.querySelector("#foodReuseTitle"),
  foodReuseContent: document.querySelector("#foodReuseContent"),
  foodReuseStatus: document.querySelector("#foodReuseStatus"),
  foodSuggestions: document.querySelector("#foodSuggestions"),
  manualFoodShortcut: document.querySelector("#manualFoodShortcut"),
  savedFoods: document.querySelector("#savedFoods"),
  savedFoodsSection: document.querySelector("#savedFoodsSection"),
  savedMeals: document.querySelector("#savedMeals"),
  savedMealsSection: document.querySelector("#savedMealsSection"),
  recentFoods: document.querySelector("#recentFoods"),
  searchNote: document.querySelector("#searchNote"),
  foodEntryCount: document.querySelector("#foodEntryCount"),
  foodList: document.querySelector("#foodList"),
  exerciseSection: document.querySelector("#exerciseSection"),
  exerciseModeEyebrow: document.querySelector("#exerciseModeEyebrow"),
  exerciseModeTitle: document.querySelector("#exerciseModeTitle"),
  exerciseMobileHeaderTitle: document.querySelector("#exerciseMobileHeaderTitle"),
  cancelExerciseEdit: document.querySelector("#cancelExerciseEdit"),
  exerciseForm: document.querySelector("#exerciseForm"),
  addExerciseToggle: document.querySelector("#addExerciseToggle"),
  closeExerciseModal: document.querySelector("#closeExerciseModal"),
  exerciseType: document.querySelector("#exerciseType"),
  exerciseMinutes: document.querySelector("#exerciseMinutes"),
  exerciseCalories: document.querySelector("#exerciseCalories"),
  exerciseEstimate: document.querySelector("#exerciseEstimate"),
  exerciseEstimateCopy: document.querySelector("#exerciseEstimateCopy"),
  exerciseCaloriesEstimate: document.querySelector("#exerciseCaloriesEstimate"),
  exerciseCaloriesNote: document.querySelector("#exerciseCaloriesNote"),
  exerciseManualEstimateNote: document.querySelector("#exerciseManualEstimateNote"),
  exerciseCaloriesEdit: document.querySelector("#exerciseCaloriesEdit"),
  exerciseSubmit: document.querySelector("#exerciseSubmit"),
  exerciseEditActions: document.querySelector("#exerciseEditActions"),
  deleteExerciseEdit: document.querySelector("#deleteExerciseEdit"),
  exerciseEntryCount: document.querySelector("#exerciseEntryCount"),
  exerciseList: document.querySelector("#exerciseList"),
};

const diaryRowSwipe = createDiaryRowSwipe(elements.foodList, window);
onDispose(() => diaryRowSwipe.destroy());

const inlineReveal = createDisclosureReveal(window);
onDispose(() => inlineReveal.dispose());
function revealInline(trigger, expandedRegion, options = {}) {
  const visibleChrome = selectors => [...document.querySelectorAll(selectors)].filter(node => {
    const style = window.getComputedStyle(node);
    return node.getClientRects().length && !node.closest('[inert]') && style.visibility === 'visible'
      && style.opacity !== '0' && ['fixed','sticky'].includes(style.position);
  });
  inlineReveal.reveal({
    trigger, expandedRegion,
    scrollContainer: () => trigger.closest('.add-flow-content') || disclosureScrollOwner(trigger,window),
    topOcclusion: () => {
      const mask = window.getComputedStyle(elements.appShell,'::before');
      const safe = mask.position === 'fixed' && mask.content !== 'none' ? parseFloat(mask.height) || 0 : 0;
      return [...visibleChrome('.storage-warning,.add-flow-header'),
        {top:0,bottom:safe,height:safe,left:0,right:window.innerWidth}];
    },
    bottomOcclusion: () => visibleChrome('.mobile-tabbar,.floating-action-stack,.add-flow-footer,.scan-review-footer,.app-update-notice'),
    ...options,
  });
}
function bindPhotoDisclosure(details, summary, region, id) {
  region.id = id; summary.setAttribute('aria-controls',id);
  summary.setAttribute('aria-expanded',String(details.open));
  details.addEventListener('toggle',() => summary.setAttribute('aria-expanded',String(details.open)));
  summary.addEventListener('click',() => {
    inlineReveal.cancel();
    // Native default activation commits open after this click. The shared
    // layout callback reads that final state; programmatic restores stay quiet.
    if (!details.open) revealInline(summary,region,{isCurrent:()=>details.open});
  });
}
const photoViewer = createFoodPhotoViewer({ onDispose, isActive });
const thumbnails = createFoodThumbnails({ root: document.body, viewer: photoViewer, onDispose });
function primeFoodBrowsePhotos() {
  // The neighboring Food panes share one small local thumbnail set. Start its
  // IndexedDB/decode work before a finger can reveal an adjacent pane.
  const ids = [
    ...uniqueRecentFoods(foodLibrary).slice(0, 16).map(food => food.coverImageId || food.photoMediaId),
    ...savedFoods.slice(0, 12).map(food => food.coverImageId || food.photoMediaId),
    ...savedMeals.slice(0, 4).map(meal => meal.coverImageId),
  ];
  void thumbnails.prime(ids);
}
primeFoodBrowsePhotos();
const photoEditor = createPhotoEditor({ viewer: photoViewer, onDispose });
const captureDraft = createCaptureDraft(foodMedia);
const expandedScannedMeals = new Map();
let scanMealSaveBusy = false, groupMealSaveBusy = false;
const plateContext = document.createElement('section');plateContext.className='food-plate-context';plateContext.hidden=true;
const individualPhoto = document.createElement('details');individualPhoto.className='food-photo-individual';individualPhoto.hidden=true;
const individualPhotoSummary = document.createElement('summary');individualPhoto.append(individualPhotoSummary);
elements.foodEditSummary.after(plateContext,individualPhoto);
function platePhotoRow(id, title, detail, label) {
  const button = thumbnails.button(id,'your plate',{kind:'meal'});if(!button)return null;
  button.classList.add('plate-photo-row');button.setAttribute('aria-label',label);
  const copy=document.createElement('span'),heading=document.createElement('strong'),description=document.createElement('small');
  heading.textContent=title;description.textContent=detail;copy.append(heading,description);button.append(copy);return button;
}
let coverFoodKey = null, undoPhotoLease = null, undoPhotoRenew = null;
const coverEditor = createPhotoEditor({ viewer: photoViewer, title: 'Saved food cover', onDispose, onSave: async (value, isCurrent) => {
  const key = coverFoodKey, existing = savedFoods.find(food => foodIdentityKey(food) === key);
  if (!existing) throw Error('This food is no longer in Saved.');
  let id = value.id;
  try {
    if (value.normalized) id = await foodMedia.put(value.normalized);
    if (!isActive() || !isCurrent() || key !== coverFoodKey) throw Error('Photo editing was closed.');
    const next = savedFoods.map(food => foodIdentityKey(food) === key ? { ...food, coverImageId: id || undefined } : food);
    localStorage.setItemConfirmed(savedFoodLibraryKey, JSON.stringify(next)); savedFoods = next;
    if (id) await foodMedia.settle([id]).catch(() => {}); collectFoodMediaSoon(); renderSavedFoods(); return id;
  } catch (error) {
    if (value.normalized && id) { await foodMedia.settle([id], { recovery: hasRecoverablePhoto(id) }).catch(() => {}); collectFoodMediaSoon(); }
    throw Error('Could not save the cover. Your existing Saved food is unchanged.');
  }
} });
const coverDisclosure = document.createElement('details'); coverDisclosure.className = 'food-photo-cover'; coverDisclosure.hidden = true;
const coverSummary = document.createElement('summary'); coverSummary.textContent = 'Saved food cover'; coverDisclosure.append(coverSummary, coverEditor.element);
bindPhotoDisclosure(individualPhoto,individualPhotoSummary,photoEditor.element,'individualFoodPhotoEditor');
bindPhotoDisclosure(coverDisclosure,coverSummary,coverEditor.element,'savedFoodCoverEditor');
elements.foodEditSummary.after(photoEditor.element, coverDisclosure); photoEditor.element.hidden = true;
function resetPhotoReview(food, editing = false) {
  photoEditor.reset({ id: editing ? food.photoMediaId : null, representativeId: editing ? null : food.coverImageId || food.photoMediaId, foodName: formatFoodDisplayName(food) });
  photoEditor.element.hidden = false; elements.foodEditSummary.after(photoEditor.element, coverDisclosure);
  plateContext.replaceChildren();plateContext.hidden=individualPhoto.hidden=true;individualPhoto.open=false;
  const capture = editing && captureContext(food,currentDay().foods);
  if (capture) {
    plateContext.hidden=individualPhoto.hidden=false;
    plateContext.append(platePhotoRow(capture.id,'Meal photo',`From photo scan · ${capture.count} ${capture.count===1?'food':'foods'} · View photo`,`View meal photo, ${capture.count} ${capture.count===1?'food':'foods'}`));
    individualPhotoSummary.textContent=food.photoMediaId?'Individual food photo':'Add an individual food photo';
    individualPhoto.open=Boolean(food.photoMediaId);individualPhoto.append(photoEditor.element);
    elements.foodEditSummary.after(plateContext,individualPhoto,coverDisclosure);
  }
  const saved = savedFoods.find(item => foodsShareIdentity(item, food)); coverFoodKey = saved ? foodIdentityKey(saved) : null;
  coverDisclosure.open = false; coverDisclosure.hidden = !saved;
  coverEditor.reset({ id: saved?.coverImageId, foodName: formatFoodDisplayName(food) });
}
async function attachDiaryPhoto(ids, photo, date) {
  if (!photo.normalized) return;
  let id;
  try {
    id = await foodMedia.put(photo.normalized);
    if (!isActive()) { await foodMedia.settle([id]); collectFoodMediaSoon(); return; }
    const day = state.days[date];
    const next = { ...state, days: { ...state.days, [date]: { ...day, foods: day.foods.map(food => ids.includes(food.id) ? { ...food, photoMediaId: id } : food) } } };
    localStorage.setItemConfirmed('calorie-counter-state', JSON.stringify(next)); state = next;
    await foodMedia.settle([id]).catch(() => {});
  } catch {
    if (id) await foodMedia.settle([id], { recovery: hasRecoverablePhoto(id) }).catch(() => {});
    foodPhotoNotice('Food saved, but the photo could not be saved. You can add a photo later.');
  } finally { collectFoodMediaSoon(); }
}
async function holdUndoPhotos(ids) {
  if (!ids.some(mediaIdValid)) return;
  return foodMedia.hold(ids, { undo: true });
}
async function finishUndoPhotos() {
  clearInterval(undoPhotoRenew); undoPhotoRenew = null;
  const lease = undoPhotoLease; undoPhotoLease = null;
  if (lease) { await lease.release().catch(() => {}); collectFoodMediaSoon(); }
}
onDispose(() => { if (undoPhotoLease) { const toast = document.querySelector('#undoToast'); if (toast) { toast.hidden = true; toast.querySelector('button').onclick = null; } } finishUndoPhotos(); collectFoodMediaSoon(); });

function loadState() {
  const saved = localStorage.getItem("calorie-counter-state");
  if (!saved) return structuredClone(defaults);

  try {
    const todayKey = localDateKey(new Date());
    const parsed = JSON.parse(saved);
    const nextState = { ...structuredClone(defaults), ...parsed };

    if (!nextState.days) nextState.days = {};
    if (!Array.isArray(nextState.progress)) nextState.progress = [];
    if (!nextState.selectedDate) nextState.selectedDate = todayKey;
    if (isFreshAppLaunch || nextState.lastOpenedDate !== todayKey) {
      nextState.selectedDate = todayKey;
      nextState.lastOpenedDate = todayKey;
    }
    if (!nextState.theme) nextState.theme = nextState.user?.theme || localStorage.getItem("calorie-counter-theme") || "light";
    if (nextState.user && !nextState.user.startWeightKg) {
      nextState.user.startWeightKg = nextState.user.weightKg;
    }

    if (Array.isArray(parsed.foods) || Array.isArray(parsed.exercises)) {
      nextState.days[nextState.selectedDate] = {
        foods: parsed.foods || [],
        exercises: parsed.exercises || [],
      };
      delete nextState.foods;
      delete nextState.exercises;
    }

    ensureDay(nextState.selectedDate, nextState);
    return nextState;
  } catch {
    return structuredClone(defaults);
  }
}

function loadFoodLibrary() {
  try {
    const saved = JSON.parse(localStorage.getItem(foodLibraryKey) || "[]");
    if (!Array.isArray(saved)) return [];
    const migrated = uniqueRecentFoods(saved.map(normalizeFoodForLibrary).filter(Boolean)).slice(0, maxRecentFoodItems);
    return migrated;
  } catch {
    return [];
  }
}

function loadSavedFoods() {
  // Older releases cleared this key during a one-time migration. Keep any
  // existing collection intact: saved foods are explicitly user-owned data.
  if (!localStorage.getItem(savedFoodMigrationKey)) {
    localStorage.setItem(savedFoodMigrationKey, "true");
  }

  try {
    const saved = JSON.parse(localStorage.getItem(savedFoodLibraryKey) || "[]");
    if (!Array.isArray(saved)) return [];
    const migrated = uniqueSavedFoods(saved.map(normalizeFoodForLibrary).filter(Boolean));
    return migrated;
  } catch {
    return [];
  }
}

function saveFoodLibrary() {
  localStorage.setItem(foodLibraryKey, JSON.stringify(uniqueRecentFoods(foodLibrary).slice(0, maxRecentFoodItems)));
}

function saveSavedFoods() {
  localStorage.setItem(savedFoodLibraryKey, JSON.stringify(uniqueSavedFoods(savedFoods)));
}

function loadSavedMeals() {
  try {
    const stored = JSON.parse(localStorage.getItem(savedMealLibraryKey) || "[]");
    if (!Array.isArray(stored) || !foodReuse) return [];
    // Reading a library is not a migration or a rename. Keep stored order,
    // snapshots and extension metadata; identify legacy foods only when reused.
    return stored.filter(meal => meal?.id && String(meal.name || "").trim() && Array.isArray(meal.foods) && meal.foods.length);
  } catch {
    return [];
  }
}

function saveSavedMeals() {
  if (localStorage.setItemConfirmed) localStorage.setItemConfirmed(savedMealLibraryKey, JSON.stringify(savedMeals));
  else localStorage.setItem(savedMealLibraryKey, JSON.stringify(savedMeals));
}

function normalizeFoodForLibrary(food) {
  if (!food?.name) return null;
  const identifiedFood = foodPersistence.ensureStableFoodIdentity(food);
  const originalSource = foodSource(identifiedFood);
  const catalogId = String(identifiedFood.catalogId || (/^(?:usda|off)-/i.test(String(identifiedFood.id || "")) ? identifiedFood.id : "")).trim();
  return {
    id: identifiedFood.id || catalogId || identifiedFood.localFoodId,
    catalogId,
    sourceId: String(identifiedFood.sourceId || ""),
    localFoodId: String(identifiedFood.localFoodId || ""),
    reusableFoodId: String(identifiedFood.reusableFoodId || ""),
    name: identifiedFood.name,
    ...(identifiedFood.nameEdited === true ? { nameEdited: true } : {}),
    displayName: String(identifiedFood.displayName || identifiedFood.name || ""),
    brand: identifiedFood.brand || "",
    source: originalSource,
    nutritionSource: String(identifiedFood.nutritionSource || ""),
    resolvedFoodName: String(identifiedFood.resolvedFoodName || identifiedFood.name || ""),
    serving: identifiedFood.serving || (identifiedFood.amount && identifiedFood.unit ? `${identifiedFood.amount} ${identifiedFood.unit}` : "1 serving"),
    servingGrams: Number(identifiedFood.servingGrams || 0) || null,
    servingMl: Number(identifiedFood.servingMl || 0) || null,
    calories: Math.round(Number(identifiedFood.calories || 0)),
    protein: roundNutritionValue(identifiedFood.protein),
    carbs: roundNutritionValue(identifiedFood.carbs),
    fat: roundNutritionValue(identifiedFood.fat),
    nutritionOverridden: Boolean(identifiedFood.nutritionOverridden),
    ...(identifiedFood.manualNutritionOverride
      ? { manualNutritionOverride: structuredClone(identifiedFood.manualNutritionOverride) }
      : {}),
    ...(identifiedFood.aiEstimate
      ? { aiEstimate: structuredClone(identifiedFood.aiEstimate) }
      : {}),
    ...(identifiedFood.sourceMetadata
      ? { sourceMetadata: structuredClone(identifiedFood.sourceMetadata) }
      : {}),
    savedAt: identifiedFood.savedAt || new Date().toISOString(),
    lastUsedAt: identifiedFood.lastUsedAt || identifiedFood.loggedAt || identifiedFood.updatedAt || identifiedFood.createdAt || identifiedFood.savedAt || new Date().toISOString(),
    useCount: Math.max(1, Number(identifiedFood.useCount || 0) || 1),
    lastUsedAmount: Number(identifiedFood.lastUsedAmount ?? identifiedFood.amount ?? 0) || null,
    lastUsedUnit: identifiedFood.lastUsedUnit || identifiedFood.unit || "",
    ...(mediaIdValid(identifiedFood.photoMediaId) ? { photoMediaId: identifiedFood.photoMediaId } : {}),
    ...(mediaIdValid(identifiedFood.coverImageId) ? { coverImageId: identifiedFood.coverImageId } : {}),
  };
}

function foodKey(food) {
  return `${food.name || ""}-${food.brand || ""}-${food.serving || food.amount || ""}-${food.unit || ""}`.toLowerCase();
}

function savedFoodKey(food) {
  return foodIdentityKey(food);
}

function recentFoodKey(food) {
  return foodIdentityKey(food);
}

function normalizedFoodText(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function foodSource(food) {
  const source = String(food?.originalSource || food?.source || "").trim();
  return /^(?:recent|saved)$/i.test(source) ? "" : source;
}

function foodIdentityKey(food) {
  return foodPersistence.foodIdentityKey(food);
}

function foodNameBrandKey(food) {
  return `${normalizedFoodText(food?.name)}:${normalizedFoodText(food?.brand)}`;
}

function foodsShareIdentity(left, right) {
  if (foodIdentityKey(left) === foodIdentityKey(right)) return true;
  // Saved entries from the old schema used "Saved" as their source and did
  // not retain the catalog ID. Match those entries by their remaining stable
  // display identity so existing favourites still work after this upgrade.
  return (!foodSource(left) || !foodSource(right)) && foodNameBrandKey(left) === foodNameBrandKey(right);
}

function uniqueSavedFoods(foods) {
  return foodPersistence.uniqueSavedFoods(foods);
}

function uniqueRecentFoods(foods) {
  return foodPersistence.uniqueRecentFoods(foods);
}

function rememberFoods(foods) {
  const nextFoods = foods.map(normalizeFoodForLibrary).filter(Boolean);
  if (!nextFoods.length) return;

  const now = new Date().toISOString();
  foodLibrary = foodPersistence.updateRecentFoods(foodLibrary, nextFoods, {
    now,
    maximum: maxRecentFoodItems,
  });
  saveFoodLibrary();
}

function isFoodSaved(food) {
  const candidate = foodForSaving(food);
  return savedFoods.some((savedFood) => foodsShareIdentity(savedFood, candidate));
}

function foodForSaving(food) {
  return normalizeFoodForLibrary({
    ...food,
    source: foodSource(food) || "Manual",
    serving: food.serving || (food.amount && food.unit ? `${food.amount} ${food.unit}` : "1 serving"),
  });
}

async function toggleSavedFood(food, leased = false) {
  const photoId = food.coverImageId || food.photoMediaId;
  if (!leased && mediaIdValid(photoId)) {
    try { return await withFoodPhotos([photoId], kept => toggleSavedFood({ ...food, photoMediaId: kept.has(food.photoMediaId) ? food.photoMediaId : undefined, coverImageId: kept.has(food.coverImageId) ? food.coverImageId : undefined }, true)); }
    catch { foodPhotoNotice('Could not save this food photo. Please try again.'); return false; }
  }
  const normalizedFood = foodForSaving(food);
  const previous = savedFoods;

  if (isFoodSaved(normalizedFood)) {
    savedFoods = savedFoods.filter((savedFood) => !foodsShareIdentity(savedFood, normalizedFood));
    elements.searchNote.textContent = `${formatFoodDisplayName(normalizedFood)} removed from saved foods.`;
  } else {
    savedFoods = uniqueSavedFoods([
      { ...savedPhotoDefinition(normalizedFood), savedAt: new Date().toISOString() },
      ...savedFoods.filter((savedFood) => !foodsShareIdentity(savedFood, normalizedFood)),
    ]);
    elements.searchNote.textContent = `${formatFoodDisplayName(normalizedFood)} saved.`;
  }

  try {
    if (localStorage.setItemConfirmed) localStorage.setItemConfirmed(savedFoodLibraryKey, JSON.stringify(savedFoods));
    else saveSavedFoods();
    collectFoodMediaSoon();
  } catch {
    savedFoods = previous;
    elements.searchNote.textContent = "Saved foods could not be updated. Please try again.";
    return false;
  }
  renderEntries();
  renderSavedFoods();
  return true;
}

function searchFoodLibrary(query) {
  const cleanQuery = query.trim().toLowerCase();
  if (cleanQuery.length < 2) return [];

  const matches = [...savedFoods, ...foodLibrary, ...stapleFoodLibrary]
    .filter((food) => [food.name, food.brand, food.source, food.serving].some((value) => String(value || "").toLowerCase().includes(cleanQuery)));
  return rankFoodSuggestions(dedupeFoodSuggestions(matches), cleanQuery).slice(0, 12);
}

function foodServingLabel(food) {
  if (Number(food?.lastUsedAmount || 0) > 0 && food?.lastUsedUnit) {
    return formatScannedFoodPortion({ amount: food.lastUsedAmount, unit: food.lastUsedUnit });
  }
  const fallback = Number(food?.servingGrams || 0) > 0 ? `${Math.round(Number(food.servingGrams))} g` : "1 serving";
  return String(food?.serving || fallback)
    .trim()
    .replace(/^per\s+/i, "")
    .replace(/(\d)\s*(?:g|gr|grm|gram|grams)\b/gi, "$1 g");
}

function rankFoodSuggestions(foods, query) {
  const recentKeys = new Set(foodLibrary.map(recentFoodKey));
  return rankFoodMatches(foods, query, food => isFoodSaved(food) ? 2 : recentKeys.has(recentFoodKey(food)) ? 1 : 0);
}

function dedupeFoodSuggestions(foods) {
  const seen = new Set();
  return foods.filter((food) => {
    const key = foodIdentityKey(food);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function saveState() {
  state.theme = state.user?.theme || state.theme || "light";
  localStorage.setItem("calorie-counter-theme", state.theme);
  localStorage.setItem("calorie-counter-state", JSON.stringify(state));
}

function isMobileSidebar() {
  return window.matchMedia("(max-width: 920px)").matches;
}

function isPhoneAddFoodLayout() {
  // One mobile task surface at every viewport; wide screens are dev-only.
  return true;
}

function focusWhenKeyboardIsStable(input) {
  if (!input || isMobileSidebar()) return;
  input.focus();
}

function modalFocusableElements(section) {
  return Array.from(section.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
    .filter((element) => !element.hidden && element.getClientRects().length > 0);
}

function setMobileSidebarOpen(isOpen) {
  elements.appShell.classList.toggle("mobile-sidebar-open", isOpen);
  elements.mobileMenuButton?.setAttribute("aria-expanded", String(isOpen));
}

function openMobileLogForm(section, input, {nested=false} = {}) {
  if (section === elements.foodSection && !nested) primeFoodBrowsePhotos();
  setFabMenuOpen(false);
  const returnTo = modalOpeners.get(addSurface.section)
    || (document.activeElement.matches('body,html') ? elements.floatingAddButton : document.activeElement);
  modalOpeners.set(section, returnTo);
  addSurface.open(section,{returnTo,nested});
}

function openEditLogForm(section, input) { openMobileLogForm(section, input); }
function closeEditLogForm(section) { closeMobileLogForm(section); }

function closeMobileLogForm(section) {
  if (section.dataset.addExiting === 'true') return;
  if (section === elements.foodSection) cancelFoodSearch();
  if (addSurface.section === section) {
    // Release a nested reuse sheet before its parent session so its saved
    // inert/scroll state cannot re-lock Today after a successful insertion.
    if(foodReuseState.open || reuseSheet?.active)closeFoodReusePanel({restoreFocus:false,immediate:true});
    const returnFoodId = section === elements.foodSection ? editingFoodId : null;
    const returnTo = returnFoodId
      ? () => [...elements.foodList.querySelectorAll('[data-food-entry-id]')].find(card => card.dataset.foodEntryId === returnFoodId)?.querySelector('.entry-main')
      : section === elements.exerciseSection ? elements.exerciseList.querySelector('.entry-card.is-selected') : null;
    // Reset hidden editors before the single unlock/reading restoration, also
    // for immediate keyboard/reduced-motion exits. During motion, their live
    // fields remain intact until the accepted exit presentation has finished.
    // Clear stale row interaction before close restores intentional focus.
    // An immediate/reduced-motion exit otherwise blurred the returned child.
    clearEntryTransientState();
    addSurface.close(section, {returnTo,beforeRestore:()=>{resetFoodForm();resetExerciseForm();}});
    positionReuseUndoToast();modalOpeners.delete(section);pausedFoodSearch=false;
    return;
  }
}

document.addEventListener("keydown", (event) => {
  if (foodReuseState.open || document.querySelector("dialog[open]")) return;
  const section = document.querySelector(".log-panel.is-adding:not([data-add-exiting])");
  if (!section) return;
  if (event.key === "Escape") {
    event.preventDefault();
    if (section === elements.foodSection && photoPlateBack()) return;
    (section === elements.foodSection ? elements.closeFoodModal : elements.closeExerciseModal)?.click();
    return;
  }
  if (event.key !== "Tab") return;
  const focusable = modalFocusableElements(section);
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable.at(-1);
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
});

function setFabMenuOpen(isOpen) {
  elements.floatingAddButton?.classList.toggle("is-open", isOpen);
  elements.floatingAddButton?.setAttribute("aria-expanded", String(isOpen));
  elements.fabOverlay?.classList.toggle("is-open", isOpen);
  elements.fabActions?.classList.toggle("is-open", isOpen);
  elements.fabActions?.setAttribute("aria-hidden", String(!isOpen));
}

function syncAddModeButtons(mode) {
  elements.addModeButtons.forEach((button) => {
    const isActive = button.dataset.addMode === mode;
    button.classList.toggle("is-active", isActive);
    button.removeAttribute("aria-pressed");
    button.setAttribute("aria-selected", String(isActive));
  });
}

function openAddFoodFromFab() {
  if (isPhoneAddFoodLayout() && addSurface.section === elements.exerciseSection) {
    syncAddModeButtons('food');openMobileLogForm(elements.foodSection,null);
    if(pausedFoodSearch){pausedFoodSearch=false;searchFoodSuggestions(elements.manualFoodName.value);}return;
  }
  const switchingFromExercise = elements.exerciseSection.classList.contains("is-adding");
  const returnTarget = modalOpeners.get(elements.exerciseSection)?.isConnected
    ? modalOpeners.get(elements.exerciseSection)
    : elements.exerciseSection.querySelector(".entry-card.is-selected") || elements.floatingAddButton;
  setFabMenuOpen(false);
  closeMobileLogForm(elements.exerciseSection);
  if (editingExerciseId) resetExerciseForm();
  if (editingFoodId) resetFoodForm();
  foodSearchFilter = "all";
  elements.foodNameLabel.textContent = "Search food";
  updateFoodFilterTabs();
  elements.foodSection.classList.remove("is-viewing-saved");
  syncAddModeButtons("food");
  openMobileLogForm(elements.foodSection, null);
  if (!elements.manualFoodName.value.trim()) showBrowseFoodSuggestions();
  if (switchingFromExercise && returnTarget?.isConnected) modalOpeners.set(elements.foodSection, returnTarget);
}

function openAddExerciseFromFab() {
  if (isPhoneAddFoodLayout() && addSurface.section === elements.foodSection) {
    pausedFoodSearch=foodSearchPending;cancelFoodSearch();syncAddModeButtons('exercise');openMobileLogForm(elements.exerciseSection,null);return;
  }
  const switchingFromFood = elements.foodSection.classList.contains("is-adding");
  const returnTarget = modalOpeners.get(elements.foodSection)?.isConnected
    ? modalOpeners.get(elements.foodSection)
    : elements.foodSection.querySelector(".entry-card.is-selected") || elements.floatingAddButton;
  setFabMenuOpen(false);
  elements.foodSection.classList.remove("is-viewing-saved", "is-searching", "is-detailing", "is-reviewing-scan");
  closeMobileLogForm(elements.foodSection);
  if (editingFoodId || selectedFoodBase || scannedFoodItems.length) resetFoodForm();
  if (editingExerciseId) resetExerciseForm();
  syncAddModeButtons("exercise");
  openMobileLogForm(elements.exerciseSection, elements.exerciseType);
  if (switchingFromFood && returnTarget?.isConnected) modalOpeners.set(elements.exerciseSection, returnTarget);
}

function openSavedFoodsFromFab() {
  setFabMenuOpen(false);
  if (editingFoodId) resetFoodForm();
  elements.foodSection.classList.add("is-viewing-saved");
  openMobileLogForm(elements.foodSection, null);
}

function openFoodScanFromFab() {
  openAddFoodFromFab();
  scanner.open();
}

function openFoodsFromHash() {
  if (!["#foods", "#add-food"].includes(window.location.hash)) return;
  if (window.location.hash === "#add-food") {
    openAddFoodFromFab();
  } else {
    closeMobileLogForm(elements.foodSection);
    closeMobileLogForm(elements.exerciseSection);
    elements.foodSection.scrollIntoView({ behavior: window.IntakeMotion?.scrollBehavior() || "auto", block: "start" });
  }
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

function showFoodFormFromSavedFoods() {
  elements.foodSection.classList.remove("is-viewing-saved");
  focusWhenKeyboardIsStable(elements.manualFoodName);
}

function syncSelectedDateWithToday() {
  const todayKey = localDateKey(new Date());
  if (state.lastOpenedDate === todayKey) return;

  state.lastOpenedDate = todayKey;
  state.selectedDate = todayKey;
  ensureDay(todayKey);
  saveState();
  render();
}

function totals() {
  const day = currentDay();
  const foodTotals = day.foods.reduce(
    (sum, food) => ({
      calories: sum.calories + Number(food.calories || 0),
      protein: sum.protein + Number(food.protein || 0),
      carbs: sum.carbs + Number(food.carbs || 0),
      fat: sum.fat + Number(food.fat || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );

  const exerciseCalories = day.exercises.reduce((sum, exercise) => sum + Number(exercise.calories || 0), 0);
  return { ...foodTotals, netCalories: foodTotals.calories - exerciseCalories, exerciseCalories };
}

const streakWindowMs = 24 * 60 * 60 * 1000;

function isFutureDateKey(dateKey) {
  return typeof dateKey === "string" && dateKey > localDateKey(new Date());
}

function streakTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function foodLoggedForDate(food, fallbackDateKey) {
  return food.loggedForDate || food.logged_for_date || fallbackDateKey;
}

function isFoodExcludedFromStreak(food, fallbackDateKey) {
  return food.excludedFromStreak === true || isFutureDateKey(foodLoggedForDate(food, fallbackDateKey));
}

function foodActivityTimestamps() {
  return Object.entries(state.days || {})
    .flatMap(([dateKey, day]) =>
      (day?.foods || [])
        .filter((food) => !isFoodExcludedFromStreak(food, dateKey))
        .map((food) => streakTimestamp(food.createdAt || food.created_at))
        .filter((timestamp) => timestamp !== null),
    )
    .sort((a, b) => a - b);
}

function foodActivityStreak(now = new Date()) {
  const nowTime = now.getTime();
  let streak = 0;
  let windowStartedAt = null;
  let lastActivityAt = null;

  foodActivityTimestamps().forEach((activityAt) => {
    if (activityAt > nowTime) return;

    if (lastActivityAt === null || activityAt - lastActivityAt > streakWindowMs) {
      streak = 1;
      windowStartedAt = activityAt;
      lastActivityAt = activityAt;
      return;
    }

    if (activityAt - windowStartedAt >= streakWindowMs) {
      streak += 1;
      windowStartedAt = activityAt;
    }

    lastActivityAt = activityAt;
  });

  if (lastActivityAt === null || nowTime - lastActivityAt > streakWindowMs) return 0;
  return streak;
}

function bestFoodDayStreak() {
  const foodDayKeys = Object.entries(state.days || {})
    .filter(([dateKey, day]) => !isFutureDateKey(dateKey) && (day?.foods || []).some((food) => !isFoodExcludedFromStreak(food, dateKey)))
    .map(([dateKey]) => dateKey)
    .sort();

  let best = 0;
  let current = 0;
  let previousKey = null;

  foodDayKeys.forEach((dateKey) => {
    const isConsecutive = previousKey
      && dateFromKey(dateKey).getTime() - dateFromKey(previousKey).getTime() === streakWindowMs;
    current = isConsecutive ? current + 1 : 1;
    best = Math.max(best, current);
    previousKey = dateKey;
  });

  return best;
}

function ensureDay(dateKey, targetState = state) {
  if (!targetState.days[dateKey]) {
    targetState.days[dateKey] = { foods: [], exercises: [] };
  }
  return targetState.days[dateKey];
}

function currentDay() {
  return ensureDay(state.selectedDate);
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateFromKey(dateKey) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function previousDayKey(dateKey) {
  return localDateKey(addDays(dateFromKey(dateKey), -1));
}

function startOfWeek(date) {
  const nextDate = new Date(date);
  const day = nextDate.getDay() || 7;
  nextDate.setDate(nextDate.getDate() - day + 1);
  return nextDate;
}

function formatMacro(value, unit) {
  const rounded = Math.round(Number(value || 0));
  return `${rounded}${unit === "kcal" ? " kcal" : " g"}`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function render() {
  // A saved/deleted Edit Food returns to an already-final Today, not to
  // deferred macro RAFs or count-up decoration behind the nested exit.
  if (editingFoodId && addSurface.section === elements.foodSection) renderSnapshot = null;
  applyTheme(state.user?.theme || state.theme || "light");
  renderProfileState();
  const daily = totals();
  const remaining = state.goals.calories - daily.netCalories;
  const calorieProgress = Math.max(0, Math.min(daily.netCalories / state.goals.calories, 1));
  const hasExerciseDeficit = daily.netCalories < 0;
  const isOverGoal = remaining < 0;
  const ringLength = 364.42;

  setAnimatedMetric(elements.remainingCalories, Math.round(remaining), " kcal", "remaining");
  setAnimatedMetric(elements.foodCaloriesTotal, Math.round(daily.calories), "", "foodCalories");
  setAnimatedMetric(elements.exerciseCaloriesTotal, Math.round(daily.exerciseCalories), "", "exerciseCalories");
  setAnimatedMetric(elements.consumedCalories, Math.round(isOverGoal ? Math.abs(remaining) : remaining), "", "remainingRing");
  setAnimatedMetric(elements.netCaloriesTotal, Math.round(daily.netCalories), "", "netCalories");
  elements.goalCaloriesText.textContent = state.goals.calories;
  elements.ringCopy.classList.toggle("is-over", isOverGoal);
  elements.calorieRing.style.strokeDashoffset = ringLength - ringLength * calorieProgress;
  elements.calorieRing.classList.toggle("is-empty", calorieProgress === 0);
  elements.calorieRing.classList.toggle("is-under", hasExerciseDeficit);
  elements.calorieRing.classList.toggle("is-over", isOverGoal);
  elements.goalStatus.classList.toggle("is-under", hasExerciseDeficit);
  elements.goalStatus.classList.toggle("is-over", isOverGoal);
  elements.goalStatus.textContent = hasExerciseDeficit ? "Below zero" : isOverGoal ? "Over goal" : "On track";
  elements.goalHelper.textContent = hasExerciseDeficit
    ? "Exercise is higher than food so far. Your net calories are below zero."
    : isOverGoal
      ? `You're ${Math.round(Math.abs(remaining))} kcal over your daily target.`
      : "Food minus exercise, compared with your daily goal.";

  renderMacros(daily);
  renderCalendar();
  renderEntries();
  renderSavedFoods();
  if (recentSuccess) playSuccessCue(recentSuccess);
  renderSnapshot = {
    remaining: Math.round(remaining),
    foodCalories: Math.round(daily.calories),
    exerciseCalories: Math.round(daily.exerciseCalories),
    netCalories: Math.round(daily.netCalories),
    remainingRing: Math.round(isOverGoal ? Math.abs(remaining) : remaining),
    macros: Object.fromEntries(macroConfig.map((macro) => {
      const goal = state.goals[macro.key];
      const progress = goal > 0 ? Math.max(0, Math.min((daily[macro.key] / goal) * 100, 100)) : 0;
      return [macro.key, progress];
    })),
    macroValues: Object.fromEntries(macroConfig.map((macro) => [macro.key, Math.round(Number(daily[macro.key] || 0))])),
  };
}

function applyTheme(theme) {
  const isDark = theme === "dark";
  const chromeColor = isDark ? "#1b1a16" : "#fbfaf6";
  document.body.dataset.theme = isDark ? "dark" : "light";
  document.documentElement.style.backgroundColor = chromeColor;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", chromeColor);
  document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]')
    ?.setAttribute("content", isDark ? "black-translucent" : "default");
}

function renderProfileState() {
  if (!state.user) {
    window.location.href = "profile.html";
    return;
  }

  elements.profileSummary.textContent = state.user.name;
  elements.profileMeta.textContent = `${state.user.weightKg} kg · ${state.user.heightCm} cm`;
  elements.profileInitials.textContent = initialsForName(state.user.name);
}

function initialsForName(name) {
  const parts = String(name || "Intake").trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts.at(-1)[0]}` : parts[0]?.slice(0, 2) || "IN").toUpperCase();
}

function formatDecimal(value, digits = 1) {
  return Number(value).toFixed(digits).replace(/\.0$/, "");
}

function defaultMealForNow(date = new Date()) {
  return mealSchedule?.defaultMealForDate(date, state.user?.mealSchedule)
    || (date.getHours() < 11 ? "breakfast" : date.getHours() < 16 ? "lunch" : "dinner");
}

function mealLabel(meal = defaultMealForNow()) {
  const labels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Snack" };
  return (labels[meal] || labels[defaultMealForNow()]).toUpperCase();
}


function foodLoggedTime(food) {
  const date = food.loggedAt || food.createdAt || food.updatedAt;
  if (!date) return new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
  return new Date(date).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function setAnimatedMetric(element, value, suffix, key) {
  const previous = renderSnapshot?.[key];
  if (previous === undefined || previous === value || document.visibilityState === "hidden") {
    setMetricText(element, value, suffix);
    return;
  }
  animateNumber(element, previous, value, suffix);
}

function setMetricText(element, value, suffix = "") {
  if (element === elements.remainingCalories) {
    element.innerHTML = `<span>${value}</span><small>${suffix.trim()}</small>`;
    return;
  }
  element.textContent = `${value}${suffix}`;
}

function animateNumber(element, from, to, suffix = "") {
  setMetricText(element, to, suffix);
  if (from !== to) window.IntakeMotion?.reveal(element);
}

function playSubmitSuccess(button) {
  if (!button) return;
  const glyph = button.querySelector(".floating-add-glyph");
  const previousText = glyph ? glyph.textContent : button.textContent;
  button.classList.add("is-success");
  if (glyph) glyph.textContent = "✓";
  else button.textContent = "✓";
  setTimeout(() => {
    button.classList.remove("is-success");
    if (button === elements.floatingAddButton && glyph) glyph.textContent = "+";
    else if (button === elements.floatingAddButton) button.textContent = "+";
    else if (button === elements.manualFoodSubmit) syncFoodSubmitLabel();
    else if (button === elements.exerciseSubmit) button.textContent = editingExerciseId ? "Save changes" : "Add exercise";
    else button.textContent = previousText;
  }, 800);
}

function playSuccessCue(success) {
  const goalPanel = document.querySelector(".goal-panel");
  if (!goalPanel) return;
  clearTimeout(successCueTimer);
  document.querySelector(".success-cue")?.remove();

  const cue = document.createElement("div");
  cue.className = "success-cue";
  cue.textContent = success.collection === "foods" ? "Added" : "Logged";
  const feedback = document.querySelector("#diaryFeedback");
  if (feedback) feedback.textContent = success.message || (success.collection === "foods" ? "Food added to the diary." : "Exercise logged.");
  goalPanel.appendChild(cue);
  elements.goalStatus.classList.add("is-success-pulse");
  elements.calorieRing.classList.add("is-success-pulse");
  elements.macroGrid.classList.add("is-success-pulse");

  successCueTimer = setTimeout(() => {
    cue.remove();
    elements.goalStatus.classList.remove("is-success-pulse");
    elements.calorieRing.classList.remove("is-success-pulse");
    elements.macroGrid.classList.remove("is-success-pulse");
  }, 900);
  recentSuccess = null;
}

function renderMacros(daily) {
  elements.macroGrid.innerHTML = "";

  macroConfig.forEach((macro, index) => {
    const consumed = daily[macro.key];
    const roundedConsumed = Math.round(Number(consumed || 0));
    const goal = state.goals[macro.key];
    const progress = goal > 0 ? Math.max(0, Math.min((consumed / goal) * 100, 100)) : 0;
    const isOver = consumed > goal;
    const remaining = Math.abs(goal - consumed);
    const macroOverageLabel = isOver ? `<em class="macro-overage"><span>+${Math.round(Number(remaining || 0))}</span><span class="macro-overage-unit"> ${macro.unit}</span></em>` : "";
    const progressLabel = `${Math.round(progress)}%`;
    const previousConsumed = renderSnapshot?.macroValues?.[macro.key];
    const initialConsumed = previousConsumed === undefined ? roundedConsumed : previousConsumed;
    const macroAmountLabel = `<span class="macro-eaten">${initialConsumed}</span><span class="macro-goal"><span class="macro-goal-desktop"> / ${Math.round(Number(goal || 0))} ${macro.unit}</span><span class="macro-goal-mobile">/${Math.round(Number(goal || 0))}&nbsp;${macro.unit}</span></span>${macroOverageLabel}`;
    const macroConsumedLabel = `${initialConsumed}${macro.unit}`;
    const macroGoalLabel = `of ${Math.round(Number(goal || 0))}${macro.unit}`;
    const previousProgress = renderSnapshot?.macros?.[macro.key];
    const initialBarProgress = previousProgress === undefined ? progress : previousProgress;
    const progressOffset = 113.1 - 113.1 * (progress / 100);
    const initialProgressOffset = previousProgress === undefined
      ? progressOffset
      : 113.1 - 113.1 * (previousProgress / 100);

    const card = document.createElement("article");
    card.className = "macro-card";
    card.classList.add(`is-${macro.key}`);
    card.style.setProperty("--macro-animation-index", index);
    card.classList.toggle("is-over", isOver);
    card.innerHTML = `
      <div class="macro-card-header">
        <div>
          <p class="label macro-name">${macro.label}</p>
          <strong class="macro-amount">${macroAmountLabel}</strong>
        </div>
        <span>${progressLabel}</span>
      </div>
      <div class="macro-card-visual" style="color:${macro.color}; --macro-progress:${progress};">
        ${macro.icon}
        <svg class="macro-ring" viewBox="0 0 48 48" aria-label="${macro.label} progress: ${progressLabel}">
          <circle class="macro-ring-track" cx="24" cy="24" r="18"></circle>
          <circle class="macro-ring-progress" cx="24" cy="24" r="18" style="stroke:${macro.color}; stroke-dashoffset:${initialProgressOffset}"></circle>
        </svg>
        <strong class="macro-ring-value">${macroConsumedLabel}</strong>
        <em>${progressLabel}</em>
      </div>
      <div>
        <p class="macro-mobile-goal">${macroGoalLabel}</p>
        <div class="macro-bar" aria-label="${macro.label} progress: ${progressLabel}">
          <span style="width:${initialBarProgress}%; background:${macro.color}"></span>
        </div>
        <div class="macro-card-footer">
          <p class="label">${isOver ? `${formatMacro(remaining, macro.unit)} over` : `${formatMacro(remaining, macro.unit)} left`}</p>
          <p class="label">${progressLabel}</p>
        </div>
      </div>
    `;
    elements.macroGrid.appendChild(card);
    if (previousConsumed !== undefined && previousConsumed !== roundedConsumed) {
      animateNumber(card.querySelector(".macro-eaten"), previousConsumed, roundedConsumed);
      animateNumber(card.querySelector(".macro-ring-value"), previousConsumed, roundedConsumed, macro.unit);
    }
    if (previousProgress !== undefined && previousProgress !== progress) {
      const progressCircle = card.querySelector(".macro-ring-progress");
      const progressBar = card.querySelector(".macro-bar span");
      progressBar.getBoundingClientRect();
      requestAnimationFrame(() => {
        progressCircle.style.strokeDashoffset = progressOffset;
        progressBar.style.width = `${progress}%`;
      });
    }
  });
}

function renderEntries() {
  const day = currentDay();
  const logHeading = selectedLogHeading();
  syncFoodModeHeader();
  syncExerciseModeHeader();
  elements.foodList.dataset.count = `${day.foods.length} ${day.foods.length === 1 ? "entry" : "entries"}`;
  elements.foodSection.dataset.count = elements.foodList.dataset.count;
  elements.foodSection.style.setProperty("--food-entry-count", `"${elements.foodList.dataset.count}"`);
  elements.foodEntryCount.textContent = elements.foodList.dataset.count;
  elements.foodEntryCount.hidden = day.foods.length === 0;
  elements.foodEntryCount.parentElement.dataset.count = elements.foodList.dataset.count;
  elements.foodLogOptionsButton.hidden = day.foods.length === 0;
  const foodHeadingLabel = elements.foodSection.querySelector(".logged-list-heading .label");
  if (foodHeadingLabel) foodHeadingLabel.textContent = logHeading;
  elements.exerciseList.dataset.count = `${day.exercises.length} ${day.exercises.length === 1 ? "entry" : "entries"}`;
  elements.exerciseSection.dataset.count = elements.exerciseList.dataset.count;
  elements.exerciseSection.style.setProperty("--exercise-entry-count", `"${elements.exerciseList.dataset.count}"`);
  elements.exerciseEntryCount.textContent = elements.exerciseList.dataset.count;
  elements.exerciseEntryCount.hidden = day.exercises.length === 0;
  elements.exerciseEntryCount.parentElement.dataset.count = elements.exerciseList.dataset.count;

  renderFoodDiary(day.foods);

  renderList(elements.exerciseList, day.exercises, "exercises", (exercise) => {
    return `${exercise.minutes} min`;
  });
}

function createDiaryEmptyAction(label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'diary-empty-action';
  const text = document.createElement('span'), chevron = document.createElement('span');
  text.textContent = label;
  chevron.textContent = '›';
  chevron.setAttribute('aria-hidden', 'true');
  button.append(text, chevron);
  return button;
}

function renderFoodDiary(foods) {
  diaryRowSwipe.reset();
  elements.foodList.innerHTML = "";
  if (!foods.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state diary-empty";
    const message = document.createElement("p");
    message.textContent = 'No food logged.';
    empty.appendChild(message);
    const actions = document.createElement("div");
    actions.className = "diary-empty-actions";
    for (const [action, label] of [["add", "Add food"], ["scan", "Scan food"]]) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.emptyFoodAction = action;
      button.textContent = label;
      actions.appendChild(button);
    }
    empty.appendChild(actions);
    {
      const reuse = createDiaryEmptyAction('Reuse food or meals');
      reuse.dataset.emptyFoodAction = "reuse";
      empty.appendChild(reuse);
    }
    elements.foodList.appendChild(empty);
    return;
  }
  for (const group of groupDiaryFoods(foods)) {
    const section = document.createElement("section");
    section.className = "diary-meal-group";
    section.dataset.diaryMeal = group.meal;
    section.setAttribute("aria-labelledby", `diary-meal-${group.meal}`);
    const header = document.createElement("div");
    header.className = "diary-meal-heading";
    const title = document.createElement("h3");
    title.id = `diary-meal-${group.meal}`;
    title.textContent = diaryMealLabel(group.meal);
    const total = document.createElement("span");
    total.textContent = `${Math.round(group.calories)} kcal`;
    header.append(title, total);
    const rows = document.createElement("div");
    rows.className = "diary-meal-entries";
    // Keep the existing row listeners, undo and recentSuccess treatment.
    renderList(rows, group.foods, "foods", food => {
      const portion = Number(food.amount) > 0 && ["g", "ml", "serving", "piece"].includes(food.unit)
        ? formatScannedFoodPortion(food) : food.serving || "";
      return [portion, foodLoggedTime(food)].filter(Boolean).join(" · ");
    });
    const cards = new Map([...rows.children].map(card=>[card.dataset.foodEntryId,card]));
    for (const block of captureBlocks(group.foods,foods)) {
      if (block.capture) {
        const capture=block.capture, others=capture.counts.filter(([meal])=>meal!==group.meal);
        const shell = document.createElement('div'); shell.className = 'scanned-meal-group'; shell.dataset.plateCapture = capture.id;
        const header = document.createElement('div'); header.className = 'scanned-meal-header';
        const photo = thumbnails.button(capture.id, 'scanned meal', {kind:'meal'});
        photo.setAttribute('aria-label', `View meal photo, ${capture.count} ${capture.count===1?'food':'foods'}`);
        const button = document.createElement('button'); button.type = 'button'; button.className = 'scanned-meal-toggle';
        const copy = document.createElement('span'), name = document.createElement('strong'), summary = document.createElement('small');
        name.textContent = 'Scanned meal';
        summary.textContent = `${block.foods.length} ${block.foods.length===1?'food':'foods'}${others.length?' here':''} · ${Math.round(block.foods.reduce((sum,food)=>sum+Number(food.calories||0),0))} kcal`;
        copy.append(name, summary);
        if (others.length) {
          const detail = document.createElement('small'); detail.textContent = others.map(([meal,count])=>`${count} ${count===1?'food':'foods'} in ${diaryMealLabel(meal)}`).join(' · '); copy.append(detail);
        }
        const arrow = document.createElement('span'); arrow.className = 'scanned-meal-chevron'; arrow.setAttribute('aria-hidden','true');
        button.append(copy,arrow);
        const children = document.createElement('div'); children.className = 'scanned-meal-children'; children.id = `scanned-meal-${capture.id}-${group.meal}`;
        button.setAttribute('aria-controls',children.id);
        const key = `${state.selectedDate}:${capture.id}`;
        bindScannedMealDisclosure({button,content:children,expanded:expandedScannedMeals.get(key)||false,window,
          cancelReveal:()=>inlineReveal.cancel(),reveal:()=>revealInline(button,()=>{
            const box=children.getBoundingClientRect();
            return disclosureRegion([header,{...box.toJSON(),bottom:box.top+children.scrollHeight,height:children.scrollHeight}]);
          },{policy:'content-focus',anchor:header,
            layoutRegions:()=>[...elements.foodList.querySelectorAll('.scanned-meal-children')].map(element=>({element,
              expanded:element.parentElement.querySelector('.scanned-meal-toggle').getAttribute('aria-expanded')==='true'})),
            isCurrent:()=>button.getAttribute('aria-expanded')==='true'}),onChange:open=>{
          expandedScannedMeals.set(key,open);
          if (expandedScannedMeals.size>256) expandedScannedMeals.delete(expandedScannedMeals.keys().next().value);
        }});
        block.foods.forEach(food=>children.append(cards.get(food.id)));
        header.append(photo,button);shell.append(header,children);rows.append(shell);
      } else block.foods.forEach(food=>rows.append(cards.get(food.id)));
    }
    section.append(header, rows);
    elements.foodList.appendChild(section);
  }
}

function renderList(container, entries, collection, subtitleFactory, titleFactory = (entry) => collection === 'foods' ? formatFoodDisplayName(entry) : entry.name) {
  container.innerHTML = "";

  if (!entries.length) {
    const empty = document.createElement("div");
    empty.className = "empty-state";
    const emptyText = {
      foods: 'No food logged.',
      exercises: 'No exercise logged.',
      progress: "No weight entries yet.",
    };
    if (collection === 'exercises') {
      empty.classList.add('diary-empty');
      const message = document.createElement('p');
      message.textContent = emptyText.exercises;
      const add = document.createElement('button');
      add.type = 'button';
      add.className = 'diary-empty-exercise-add';
      add.textContent = 'Add exercise';
      add.dataset.emptyExerciseAction = 'add';
      empty.append(message, add);
    } else empty.textContent = emptyText[collection] || "No entries yet.";
    container.appendChild(empty);
    return;
  }

  entries.forEach((entry) => {
    const card = document.querySelector("#entryTemplate").content.firstElementChild.cloneNode(true);
    const actionToggle = card.querySelector(".entry-actions-toggle");
    const inlineActions = card.querySelector(".entry-inline-actions");
    const inlineEditButton = card.querySelector(".entry-inline-edit");
    const inlineSaveButton = card.querySelector(".entry-inline-save");
    const inlineDeleteButton = card.querySelector(".entry-inline-delete");
    const canEdit = collection === "foods" || collection === "exercises";
    if (recentSuccess?.collection === collection && (recentSuccess?.id === entry.id || recentSuccess?.ids?.includes(entry.id))) {
      card.classList.add("is-new-entry");
    }
    if (collection === "foods" && editingFoodId === entry.id) {
      card.classList.add("is-selected");
    }
    if (collection === "exercises" && editingExerciseId === entry.id) {
      card.classList.add("is-selected");
    }
    card.querySelector("strong").textContent = titleFactory(entry);
    card.querySelector("p").textContent = subtitleFactory(entry);
    if (collection === "foods") {
      // Separate trailing action keeps the primary-row baseline; the full
      // 44px button remains the target, not just its visible glyph.
      actionToggle.innerHTML = '<span class="food-overflow-glyph" aria-hidden="true">•••</span>';
      const entryMain = card.querySelector(".entry-main");
      const calories = document.createElement("span");
      entryMain.classList.add("has-kcal");
      calories.className = "entry-kcal";
      calories.textContent = `${Math.round(entry.calories || 0)} kcal`;
      calories.setAttribute("aria-label", `${Math.round(entry.calories || 0)} kcal`);
      entryMain.appendChild(calories);
      const thumbnail = thumbnails.button(entry.photoMediaId, formatFoodDisplayName(entry));
      if (thumbnail) { const surface = card.querySelector('.entry-surface'); surface.classList.add('has-food-photo'); surface.prepend(thumbnail); }
    } else if (collection === "exercises") {
      const entryMain = card.querySelector(".entry-main");
      const calories = document.createElement("span");
      entryMain.classList.add("has-kcal", "has-exercise-kcal");
      calories.className = "entry-kcal";
      calories.textContent = `${Math.round(entry.calories || 0)} kcal`;
      calories.setAttribute("aria-label", `${Math.round(entry.calories || 0)} kcal burned`);
      entryMain.appendChild(calories);
    }
    if (collection === 'foods') {
      bindFoodDiaryRow(card, entry);
      container.appendChild(card);
      return;
    }
    if (canEdit) {
      card.tabIndex = 0;
      // Keep the article semantics: its overflow contains real action buttons.
      card.removeAttribute("role");
      card.setAttribute("aria-label", "Edit " + titleFactory(entry));
      actionToggle.setAttribute("aria-label", `Show actions for ${titleFactory(entry)}`);
      inlineActions.id = `inline-exercise-actions-${entry.id}`;
      actionToggle.setAttribute('aria-controls',inlineActions.id);
      actionToggle.addEventListener("click", (event) => {
        event.stopPropagation();
        const isOpen = !card.classList.contains("is-actions-open");
        closeInlineEntryActions(card);
        card.classList.toggle("is-actions-open", isOpen);
        inlineActions.hidden = !isOpen;
        actionToggle.setAttribute("aria-expanded", String(isOpen));
        if (isOpen) {
          requestAnimationFrame(() => inlineEditButton.focus({preventScroll:true}));
          revealInline(actionToggle,inlineActions,{isCurrent:()=>!inlineActions.hidden});
        }
      });
      inlineActions.addEventListener("click", (event) => event.stopPropagation());
      inlineEditButton.addEventListener("click", () => editEntry(collection, entry));
      inlineDeleteButton.addEventListener("click", () => deleteEntryWithUndo(collection, entry));
      if (collection === "foods") {
        const saved = isFoodSaved(entry);
        inlineSaveButton.textContent = saved ? "Unsave" : "Save";
        inlineSaveButton.setAttribute("aria-label", `${saved ? "Unsave" : "Save"} ${titleFactory(entry)}`);
        inlineSaveButton.addEventListener("click", () => toggleSavedFood(entry));
      } else {
        inlineSaveButton.remove();
      }
      card.addEventListener("click", () => {
        closeInlineEntryActions();
        editEntry(collection, entry);
      });
      card.addEventListener("keydown", (event) => {
        // Nested action buttons own their Enter/Space activation.
        if (event.target !== card) return;
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        closeInlineEntryActions();
        editEntry(collection, entry);
      });
    } else {
      actionToggle.remove();
      inlineActions.remove();
    }
    container.appendChild(card);
  });
}

function runFoodEntryAction(action, entry) {
  closeInlineEntryActions();
  if (action === 'edit') editEntry('foods', entry);
  else if (action === 'save') toggleSavedFood(entry);
  else if (action === 'delete') deleteEntryWithUndo('foods', entry);
}

function bindFoodDiaryRow(card, entry) {
  card.dataset.foodEntryId = entry.id;
  const main = card.querySelector('.entry-main'), toggle = card.querySelector('.entry-actions-toggle');
  // One real edit target, with a sibling overflow control, not nested buttons.
  main.tabIndex = 0; main.setAttribute('role', 'button');main.setAttribute('aria-label', `Edit ${formatFoodDisplayName(entry)}`);
  card.querySelector('.entry-inline-actions').remove();
  const shelf = document.createElement('div');
  shelf.className = 'diary-row-swipe-actions';
  shelf.setAttribute('aria-hidden', 'true');
  shelf.inert = true;
  const saved = isFoodSaved(entry);
  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'diary-row-swipe-save';
  save.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} ${formatFoodDisplayName(entry)}`);
  save.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 4.5h11v15l-5.5-3.5-5.5 3.5z"/></svg><span></span>';
  save.querySelector('span').textContent = saved ? 'Unsave' : 'Save';
  const remove = document.createElement('button');
  remove.type = 'button';
  remove.className = 'diary-row-swipe-delete';
  remove.setAttribute('aria-label', `Delete ${formatFoodDisplayName(entry)}`);
  remove.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4.5 7h15M9 7V4.5h6V7m-8.5 0 .7 12h9.6l.7-12M10 10v6m4-6v6"/></svg><span>Delete</span>';
  shelf.append(save, remove);
  card.prepend(shelf);
  card.querySelector('.food-photo-thumb')?.addEventListener('click', () => diaryRowSwipe.close(true), {capture:true});
  shelf.addEventListener('click', event => event.stopPropagation());
  save.addEventListener('click', async () => {
    save.disabled = remove.disabled = true;
    try {
      const success = await toggleSavedFood(entry);
      if (!success && card.isConnected) save.disabled = remove.disabled = false;
    } catch { if (card.isConnected) save.disabled = remove.disabled = false; }
  });
  remove.addEventListener('click', async () => {
    save.disabled = remove.disabled = true;
    try {
      const success = await deleteEntryWithUndo('foods', entry, {
        beforeRender: () => collapseDiaryFoodRow(card, window),
      });
      if (!success && card.isConnected) save.disabled = remove.disabled = false;
    } catch { if (card.isConnected) save.disabled = remove.disabled = false; }
  });
  toggle.setAttribute('aria-label', `Actions for ${formatFoodDisplayName(entry)}`);
  toggle.setAttribute('aria-controls', 'foodReusePanel');toggle.setAttribute('aria-haspopup', 'dialog');
  toggle.addEventListener('click', event => {
    event.stopPropagation();diaryRowSwipe.close();toggle.focus({preventScroll:true});
    openFoodReusePanel('row-actions', { entryId:entry.id });
    toggle.setAttribute('aria-expanded','true');
  });
  const edit = () => { diaryRowSwipe.close(true); runFoodEntryAction('edit', entry); };
  card.addEventListener('click', () => {
    main.focus({preventScroll:true});edit();
  });
  main.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();edit();
  });
}

function editEntry(collection, entry) {
  if (collection === "foods") fillFoodFormForEdit(entry);
  if (collection === "exercises") fillExerciseFormForEdit(entry);
}

async function deleteEntryWithUndo(collection, entry, {fromEditor=false, beforeRender} = {}) {
  const dateKey = state.selectedDate;
  let photoLease;
  if (collection === 'foods' && [entry.photoMediaId,entry.captureId].some(mediaIdValid)) {
    try { photoLease = await holdUndoPhotos([entry.photoMediaId,entry.captureId]); } catch { foodPhotoNotice('Could not protect the photo for Undo. Please try deleting again.'); return; }
    if (!isActive()) { photoLease?.release(); return; }
    if (!state.days[dateKey]?.foods.some(food => food.id === entry.id)) { photoLease?.release(); return; }
  }
  const mobileDeletedMessage = collection === "foods"
    ? "Food deleted"
    : collection === "exercises"
      ? "Exercise deleted"
      : "Entry deleted";
  const deletedMessage = isPhoneAddFoodLayout() ? mobileDeletedMessage : "Item deleted.";
  if (collection === "progress") {
    const previousProgress = [...state.progress];
    state.progress = state.progress.filter((item) => item.id !== entry.id);
    saveState();
    render();
    showUndoToast(deletedMessage, () => {
      state.progress = previousProgress;
      saveState();
      render();
    });
    return;
  }

  const day = ensureDay(dateKey);
  const previousEntries = [...day[collection]];

  const remaining = day[collection].filter((item) => item.id !== entry.id);
  if (fromEditor) {
    // The nested editor stays intact until deletion is confirmed. Its live
    // Today parent must already be current when the horizontal exit begins.
    try { state = commitDiaryDay(localStorage, state, {...day, [collection]:remaining}); }
    catch (error) { photoLease?.release(); throw error; }
  } else {
    day[collection] = remaining;
    if (collection === "foods" && editingFoodId === entry.id) resetFoodForm();
    if (collection === "exercises" && editingExerciseId === entry.id) resetExerciseForm();
    saveState();
  }
  if (beforeRender) await beforeRender();
  render();
  showUndoToast(deletedMessage, () => {
    ensureDay(dateKey);
    state.days[dateKey][collection] = previousEntries;
    saveState();
    render();
  }, { photoLease });
  collectFoodMediaSoon();
  return true;
}

function showUndoToast(message, onUndo, { reuse = false, photoLease } = {}) {
  finishUndoPhotos();
  if (photoLease) { undoPhotoLease = photoLease; undoPhotoRenew = setInterval(() => undoPhotoLease?.renew().catch(() => {}), 60_000); }
  clearTimeout(undoToastTimer);
  let toast = document.querySelector("#undoToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "undoToast";
    toast.className = "undo-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    toast.innerHTML = "<span></span><button type=\"button\">Undo</button>";
    document.body.appendChild(toast);
  }
  toast.dataset.reuse = String(reuse);
  if (!reuse) document.body.appendChild(toast);
  toast.querySelector("span").textContent = message;
  toast.hidden = false;
  const undoButton = toast.querySelector("button");
  const dismiss = () => {
    clearTimeout(undoToastTimer);
    toast.classList.remove("is-visible");
    toast.hidden = true;
    undoButton.onclick = null;
    finishUndoPhotos();
  };
  const scheduleDismiss = () => {
    clearTimeout(undoToastTimer);
    undoToastTimer = setTimeout(() => {
      if (!toast.contains(document.activeElement)) dismiss();
    }, 8000);
  };
  toast.onfocusin = () => clearTimeout(undoToastTimer);
  toast.onfocusout = scheduleDismiss;
  toast.onpointerenter = event => { if (event.pointerType === 'mouse' && window.matchMedia('(hover: hover) and (pointer: fine)').matches) clearTimeout(undoToastTimer); };
  toast.onpointerleave = event => { if (event.pointerType === 'mouse') scheduleDismiss(); };
  undoButton.onclick = () => {
    onUndo();
    dismiss();
  };
  toast.classList.add("is-visible");
  positionReuseUndoToast();
  scheduleDismiss();
}

function positionReuseUndoToast() {
  const toast = document.querySelector('#undoToast[data-reuse="true"]');
  if (!toast) return;
  const host = foodReuseState.open ? elements.foodReusePanel
    : elements.foodSection.classList.contains('is-adding') ? elements.foodSection : document.body;
  host.appendChild(toast);
  toast.inert = false;
}

function clearEntryTransientState({ preserveFocus = false } = {}) {
  closeInlineEntryActions();
  document.querySelectorAll(".entry-card.is-selected").forEach((entryCard) => {
    entryCard.classList.remove("is-selected");
  });
  if (!preserveFocus && document.activeElement?.closest?.(".entry-card")) {
    document.activeElement.blur();
  }
}

document.addEventListener("pointerdown", (event) => {
  if (event.target.closest(".entry-card")) return;
  closeInlineEntryActions();
});

function renderCalendar() {
  calendarSwipe?.reset();
  const selected = dateFromKey(state.selectedDate);
  const todayKey = localDateKey(new Date());

  elements.selectedDateLabel.textContent = selected.toLocaleDateString("en-US", { weekday: "long" });
  elements.appTitle.textContent = selected.toLocaleDateString("en-US", { month: "long", day: "numeric" });
  elements.todayButton.disabled = state.selectedDate === todayKey;
  renderCalendarWeek(elements.calendarStrip, selected);
}

function renderCalendarWeek(container, selected, preview = false) {
  const weekStart = startOfWeek(selected);
  const todayKey = localDateKey(new Date());
  container.replaceChildren();

  Array.from({ length: 7 }).forEach((_, index) => {
    const date = addDays(weekStart, index);
    const dateKey = localDateKey(date);
    // Preview is presentation only: no empty diary days or writes while dragging.
    const day = preview ? (state.days[dateKey] || { foods: [], exercises: [] }) : ensureDay(dateKey);
    const summary = summarizeDay(day);
    const hasFoodLog = day.foods.length > 0;
    const hasEntries = day.foods.length > 0 || day.exercises.length > 0;
    const isFuture = dateKey > todayKey;
    const isOverGoal = summary.netCalories > state.goals.calories;
    const status = hasEntries && !isFuture ? (isOverGoal ? "over" : "complete") : "empty";
    const statusLabel = isFuture && hasEntries
      ? "Planned entries"
      : status === "empty"
        ? "No entries"
        : status === "over"
          ? "Over calorie goal"
          : "Within calorie goal";
    const button = document.createElement("button");
    button.type = "button";
    button.className = "day-tile";
    button.classList.toggle("is-selected", dateKey === state.selectedDate);
    button.classList.toggle("has-food-log", hasFoodLog);
    button.classList.toggle("is-calorie-over", hasFoodLog && isOverGoal);
    button.setAttribute("aria-pressed", String(dateKey === state.selectedDate));
    button.classList.toggle("is-today", dateKey === todayKey);
    button.dataset.dateKey = dateKey;
    button.dataset.status = status;
    button.title = statusLabel;
    const dateDescription = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
    const calendarState = [
      dateKey === todayKey ? "Today" : "",
      dateKey === state.selectedDate ? "Selected" : "",
      statusLabel
    ].filter(Boolean).join(", ");
    button.setAttribute("aria-label", `${dateDescription}: ${calendarState}`);
    button.innerHTML = `
      <span>${date.toLocaleDateString("en-US", { weekday: "short" })}</span>
      <strong>${date.getDate()}</strong>
      <i aria-hidden="true"></i>
    `;
    if (preview) button.tabIndex = -1;
    else button.addEventListener("click", () => {
      state.selectedDate = dateKey;
      ensureDay(dateKey);
      saveState();
      render();
      requestAnimationFrame(() => elements.calendarStrip.querySelector(`[data-date-key="${dateKey}"]`)?.focus());
    });
    container.appendChild(button);
  });
}

function summarizeDay(day) {
  const foodTotals = day.foods.reduce(
    (sum, food) => ({
      calories: sum.calories + Math.round(Number(food.calories || 0)),
      protein: sum.protein + Math.round(Number(food.protein || 0)),
    }),
    { calories: 0, protein: 0 },
  );
  const exerciseCalories = day.exercises.reduce((sum, exercise) => sum + Math.round(Number(exercise.calories || 0)), 0);
  return { ...foodTotals, exerciseCalories, netCalories: foodTotals.calories - exerciseCalories };
}

function foodEntriesForDate(dateKey) {
  return state.days[dateKey]?.foods || [];
}

function foodMealGroups(dateKey) {
  return foodReuse.groupFoodEntriesByMeal(foodEntriesForDate(dateKey));
}

function formatReuseDate(dateKey) {
  return dateFromKey(dateKey).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function mealGroupSummary(group) {
  const count = group.foods.length;
  return `${count} ${count === 1 ? "food" : "foods"} · ${Math.round(group.calories)} kcal`;
}

function selectedScannedFoods() {
  return scannedFoodItems.filter((food) => food.included && String(food.name || "").trim());
}

function scannedFoodToReusableEntry(food, meal) {
  const amount = Math.max(0, Number(food.amount || 0));
  const unit = ["serving", "piece", "g", "ml"].includes(food.unit) ? food.unit : "serving";
  const inputMode = scannedFoodAnalysis?.inputMode === "text" ? "text" : "photo";
  return {
    catalogId: food.sourceId || "",
    sourceId: food.sourceId || "",
    name: String(food.name || "").trim(),
    ...(food.nameEdited === true ? { nameEdited: true } : {}),
    displayName: String(food.name || "").trim(),
    brand: "",
    source: food.source || (inputMode === "text" ? "AI ESTIMATE" : "OpenAI photo estimate"),
    nutritionSource: food.nutritionSource || "",
    resolvedFoodName: food.resolvedFoodName || String(food.name || "").trim(),
    serving: formatScannedFoodPortion({ ...food, amount, unit }),
    servingGrams: Number(food.servingGrams || 0) || null,
    servingMl: Number(food.servingMl || 0) || null,
    amount,
    unit,
    meal,
    calories: Math.max(0, Number(food.calories || 0)),
    protein: Math.max(0, Number(food.protein || 0)),
    carbs: Math.max(0, Number(food.carbs || 0)),
    fat: Math.max(0, Number(food.fat || 0)),
    nutritionOverridden: Boolean(food.nutritionOverridden),
    ...(food.manualNutritionOverride ? { manualNutritionOverride: { ...food.manualNutritionOverride } } : {}),
    aiEstimate: {
      inputMode,
      confidence: food.confidence || scannedFoodAnalysis?.confidence || "low",
      notes: String(food.notes || "").trim(),
    },
  };
}

function setFoodReuseStatus(message, isError = false) {
  if (!elements.foodReuseStatus) return;
  elements.foodReuseStatus.textContent = message;
  elements.foodReuseStatus.classList.toggle("is-error", isError);
}

function foodReuseSurface() {
  return reuseSheet ||= createSheetSurface({
    panel: elements.foodReusePanel, backdrop: elements.foodReuseBackdrop,
    handle: elements.foodReuseDragZone, scroller: elements.foodReuseContent,
    pressSelector: '.food-reuse-action,.food-reuse-meal,.saved-meal-card,.food-reuse-back,.food-reuse-close',
    background: () => [elements.appShell, document.querySelector('.mobile-tabbar'), elements.floatingAddButton, addSurface.section],
    initialFocus: () => elements.foodReuseTitle,
    restoreTarget: opener => {
      if (opener?.isConnected && opener !== document.body) return opener;
      const row = [...elements.foodList.querySelectorAll('[data-food-entry-id]')].find(row => row.dataset.foodEntryId === foodReuseState.entryId);
      const id = opener?.dataset?.savedMealId;
      const replacement = id && [...document.querySelectorAll('[data-saved-meal-id]')].find(button => button.dataset.savedMealId === id && button.offsetParent !== null);
      return foodReuseState.view === 'row-actions' && row?.querySelector('.entry-actions-toggle') || replacement ||
        (elements.foodSection.classList.contains('is-adding') ? elements.manualFoodName : elements.foodLogOptionsButton);
    },
    onDismiss: options => closeFoodReusePanel(options), onBack: backFoodReusePanel,
  });
}

function finishFoodReuseClose() {
  elements.foodLogOptionsButton?.setAttribute("aria-expanded", "false");
  if (['row-actions', 'recent-actions'].includes(foodReuseState.view)) foodReuseOpener?.setAttribute?.('aria-expanded', 'false');
  positionReuseUndoToast();
  foodReuseOpener = null;
}

function closeFoodReusePanel({ restoreFocus = true, immediate = false, dragDistance = 0 } = {}) {
  if (!foodReuseState.open && !reuseSheet?.active) return;
  foodReuseState.open = false;
  document.body.classList.remove("food-reuse-open");
  const done = reuseSheet?.close({ restoreFocus, immediate, dragDistance });
  if (!reuseSheet?.active) finishFoodReuseClose();
  else done.then(() => { if (!foodReuseState.open) finishFoodReuseClose(); });
}

function openFoodReusePanel(view = "menu", options = {}) {
  if (!reuseSheet?.active) foodReuseOpener = view === 'row-actions'
    ? [...elements.foodList.querySelectorAll('[data-food-entry-id]')].find(row => row.dataset.foodEntryId === options.entryId)?.querySelector('.entry-actions-toggle')
    : options.opener || (view === 'menu' ? elements.foodLogOptionsButton : document.activeElement);
  foodReuseState = {
    ...foodReuseState,
    open: true,
    view,
    sourceDate: options.sourceDate ?? foodReuseState.sourceDate,
    selectedMeal: options.selectedMeal ?? foodReuseState.selectedMeal,
    savedMealId: options.savedMealId ?? foodReuseState.savedMealId,
    entryId: options.entryId ?? foodReuseState.entryId,
    recentFoodKey: options.recentFoodKey ?? foodReuseState.recentFoodKey,
  };
  positionReuseUndoToast();
  elements.foodLogOptionsButton?.setAttribute("aria-expanded", String(foodReuseOpener === elements.foodLogOptionsButton));

  document.body.classList.add("food-reuse-open");
  renderFoodReusePanel();
  foodReuseSurface().open({ returnTo: foodReuseOpener });
}


function reuseActionMarkup(action, title, description = "", { disabled = false } = {}) {
  return `<button class="food-reuse-action" type="button" data-reuse-action="${action}"${disabled ? " disabled aria-disabled=\"true\"" : ""}>
    <span><strong>${escapeHtml(title)}</strong>${description ? `<small>${escapeHtml(description)}</small>` : ""}</span>
    <span aria-hidden="true">→</span>
  </button>`;
}

function mealGroupMarkup(group, action) {
  return `<button class="food-reuse-meal" type="button" data-reuse-action="${action}" data-meal="${escapeHtml(group.meal)}">
    <span><strong>${escapeHtml(mealLabel(group.meal))}</strong><small>${escapeHtml(mealGroupSummary(group))}</small></span>
    <span aria-hidden="true">→</span>
  </button>`;
}

function renderFoodReuseEmpty(message, allowChooseDate = false) {
  elements.foodReuseContent.innerHTML = `<div class="food-reuse-empty"><p>${escapeHtml(message)}</p>
    ${allowChooseDate ? '<button type="button" class="secondary-button" data-reuse-action="copy-date">Choose another day</button>' : ""}
  </div>`;
}

function renderFoodReusePanel() {
  renderFoodReuseContents();
  reuseSheet?.update();
}

function renderFoodReuseContents() {
  const view = foodReuseState.view;
  const backViews = new Set(["repeat-meal", "copy-date", "save-meal-picker", "save-meal-name", "saved-meal-review", "rename-saved-meal", "saved-meals"]);
  elements.foodReusePanel.dataset.reuseView = view;
  elements.foodReuseBack.hidden = !backViews.has(view);
  if (view === 'recent-actions') {
    const food = foodLibrary.find(item => foodIdentityKey(item) === foodReuseState.recentFoodKey);
    if (!food) { closeFoodReusePanel(); return; }
    elements.foodReuseEyebrow.textContent = 'Recent food';
    elements.foodReuseTitle.textContent = formatFoodDisplayName(food);
    setFoodReuseStatus('');
    elements.foodReuseContent.innerHTML = `<button class="food-reuse-action" type="button" data-recent-action="save"><strong>${isFoodSaved(food) ? 'Unsave' : 'Save'}</strong></button>
      <button class="food-reuse-action" type="button" data-recent-action="remove"><strong>Remove from Recent</strong></button>`;
    return;
  }
  if (view === 'row-actions') {
    const entry = currentDay().foods.find(food => food.id === foodReuseState.entryId);
    if (!entry) { closeFoodReusePanel();return; }
    elements.foodReuseTitle.textContent = formatFoodDisplayName(entry);
    setFoodReuseStatus('');
    elements.foodReuseContent.innerHTML = ['edit','save','delete'].map(action =>
      `<button class="food-reuse-action" type="button" data-entry-action="${action}"><strong>${action === 'edit' ? 'Edit' : action === 'delete' ? 'Delete' : isFoodSaved(entry) ? 'Unsave' : 'Save'}</strong></button>`).join('');
    return;
  }
  elements.foodReuseEyebrow.textContent = view === "saved-meal-review" ? "Saved meal" : "Food log";
  setFoodReuseStatus("");

  if (view === "save-scan-meal-name") {
    const meal = foodReuseState.selectedMeal || elements.foodMeal.value || defaultMealForNow();
    const foods = selectedScannedFoods().map((food) => scannedFoodToReusableEntry(food, meal));
    if (!foods.length) {
      closeFoodReusePanel({ restoreFocus: false });
      return;
    }
    const calories = foods.reduce((sum, food) => sum + Number(food.calories || 0), 0);
    elements.foodReuseEyebrow.textContent = scannedFoodAnalysis?.inputMode === "text" ? "AI estimate" : "Plate review";
    elements.foodReuseTitle.textContent = "Save meal";
    elements.foodReuseContent.innerHTML = `<form class="food-reuse-save-form" data-reuse-save-form>
      <label class="food-reuse-field"><span class="label">Name</span><input name="mealName" maxlength="80" value="${escapeHtml(foodReuse.suggestSavedMealName(foods))}" required></label>
      <p class="food-reuse-summary"><strong>${foods.length} ${foods.length === 1 ? "food" : "foods"}</strong><span>${Math.round(calories)} kcal</span></p>
      <button class="primary-button" type="submit">Save meal</button>
    </form>`;
    return;
  }

  if (view === "menu") {
    const mobileContextualActions = isPhoneAddFoodLayout();
    const yesterdayFoods = foodEntriesForDate(previousDayKey(state.selectedDate));
    const yesterdayMeals = foodMealGroups(previousDayKey(state.selectedDate));
    const currentMeals = foodMealGroups(state.selectedDate);
    elements.foodReuseTitle.textContent = "Reuse food";
    elements.foodReuseContent.innerHTML = [
      reuseActionMarkup("saved-meals", "Saved meals", "Review and add a reusable meal"),
      reuseActionMarkup(
        "repeat-yesterday",
        "Repeat yesterday",
        mobileContextualActions
          ? (yesterdayFoods.length ? "Add the previous calendar day's food" : "No food logged yesterday")
          : "Copy the previous calendar day's food",
        { disabled: mobileContextualActions && !yesterdayFoods.length },
      ),
      reuseActionMarkup(
        "repeat-meal",
        "Repeat a meal",
        mobileContextualActions && !yesterdayMeals.length ? "No meals available yesterday" : "Choose a meal from yesterday",
        { disabled: mobileContextualActions && !yesterdayMeals.length },
      ),
      reuseActionMarkup("copy-date", "Copy from another day", "Choose an entire day or one meal"),
      reuseActionMarkup(
        "save-meal-picker",
        "Save a meal",
        mobileContextualActions && !currentMeals.length ? "No food to save from this day" : "Create a reusable meal from this day",
        { disabled: mobileContextualActions && !currentMeals.length },
      ),
    ].join("");
    return;
  }

  if (view === "repeat-meal") {
    const sourceDate = previousDayKey(state.selectedDate);
    const groups = foodMealGroups(sourceDate);
    elements.foodReuseTitle.textContent = `Repeat from ${formatReuseDate(sourceDate)}`;
    if (!groups.length) {
      renderFoodReuseEmpty("No food logged yesterday.", true);
      return;
    }
    elements.foodReuseContent.innerHTML = `<p class="food-reuse-hint">Choose a meal to add to ${formatReuseDate(state.selectedDate)}.</p>${groups.map((group) => mealGroupMarkup(group, "copy-meal")).join("")}`;
    foodReuseState.sourceDate = sourceDate;
    return;
  }

  if (view === "copy-date") {
    const sourceDate = foodReuseState.sourceDate || previousDayKey(state.selectedDate);
    foodReuseState.sourceDate = sourceDate;
    const groups = foodMealGroups(sourceDate);
    elements.foodReuseTitle.textContent = "Copy another day";
    elements.foodReuseContent.innerHTML = `<label class="food-reuse-field"><span class="label">Source date</span>
      <input type="date" data-reuse-source-date value="${escapeHtml(sourceDate)}">
    </label>
    <div class="food-reuse-source-results">
      ${groups.length ? `${reuseActionMarkup("copy-day", "Copy entire day", `${foodEntriesForDate(sourceDate).length} foods · ${formatReuseDate(sourceDate)}`)}${groups.map((group) => mealGroupMarkup(group, "copy-meal")).join("")}` : '<div class="food-reuse-empty"><p>No food logged on this day.</p></div>'}
    </div>`;
    return;
  }

  if (view === "save-meal-picker") {
    const groups = foodMealGroups(state.selectedDate);
    elements.foodReuseTitle.textContent = "Save a meal";
    if (!groups.length) {
      renderFoodReuseEmpty(`No food logged on ${formatReuseDate(state.selectedDate)}.`);
      return;
    }
    elements.foodReuseContent.innerHTML = `<p class="food-reuse-hint">Choose a meal from ${formatReuseDate(state.selectedDate)}.</p>${groups.map((group) => mealGroupMarkup(group, "name-saved-meal")).join("")}`;
    return;
  }

  if (view === "save-meal-name") {
    const group = foodMealGroups(state.selectedDate).find((item) => item.meal === foodReuseState.selectedMeal);
    if (!group) {
      foodReuseState.view = "save-meal-picker";
      renderFoodReusePanel();
      return;
    }
    const suggestedName = foodReuse.suggestSavedMealName(group.foods) || mealLabel(group.meal).toLowerCase();
    elements.foodReuseTitle.textContent = "Save meal";
    elements.foodReuseContent.innerHTML = `<form class="food-reuse-save-form" data-reuse-save-form>
      <label class="food-reuse-field"><span class="label">Name</span><input name="mealName" maxlength="80" value="${escapeHtml(suggestedName)}" required></label>
      <p class="food-reuse-summary"><strong>${escapeHtml(mealLabel(group.meal))}</strong><span>${escapeHtml(mealGroupSummary(group))}</span></p>
      <button class="primary-button" type="submit">Save meal</button>
    </form>`;
    return;
  }

  if (view === "rename-saved-meal") {
    const savedMeal = savedMeals.find((meal) => meal.id === foodReuseState.savedMealId);
    if (!savedMeal) return;
    elements.foodReuseTitle.textContent = "Rename saved meal";
    elements.foodReuseContent.innerHTML = `<form class="food-reuse-save-form" data-reuse-rename-form novalidate>
      <label class="food-reuse-field"><span class="label">Name</span><input name="mealName" maxlength="80" value="${escapeHtml(savedMeal.name)}" aria-describedby="foodReuseStatus" required></label>
      <div class="food-reuse-management"><button type="button" data-reuse-action="cancel-rename-saved-meal">Cancel</button><button class="primary-button" type="submit">Save</button></div>
    </form>`;
    return;
  }

  if (view === "saved-meals") {
    elements.foodReuseTitle.textContent = "Saved meals";
    elements.foodReuseContent.replaceChildren(...savedMeals.map(meal => createSavedMealCard(meal)));
    if (!savedMeals.length) renderFoodReuseEmpty("Meals you save for reuse will appear here.");
    return;
  }

  if (view === "saved-meal-review") {
    const savedMeal = savedMeals.find((meal) => meal.id === foodReuseState.savedMealId);
    if (!savedMeal) {
      closeFoodReusePanel({ restoreFocus: false });
      return;
    }
    elements.foodReuseTitle.textContent = savedMeal.name;
    const calories = savedMeal.foods.reduce((sum, food) => sum + Number(food.calories || 0), 0);
    elements.foodReuseContent.innerHTML = `<div class="saved-meal-review-summary"><strong>${savedMeal.foods.length} ${savedMeal.foods.length === 1 ? "food" : "foods"}</strong><span>${Math.round(calories)} kcal</span></div>
      <div class="saved-meal-review-foods">${savedMeal.foods.map((food) => `<div><span>${escapeHtml(formatFoodDisplayName(food))}</span><small>${escapeHtml(Number(food.amount || 0) > 0 && food.unit ? formatScannedFoodPortion(food) : food.serving || "1 serving")}</small></div>`).join("")}</div>
      <label class="food-reuse-field"><span class="label">Meal</span><select data-saved-meal-target>
        ${["breakfast", "lunch", "dinner", "snack"].map((meal) => `<option value="${meal}"${meal === savedMeal.meal ? " selected" : ""}>${mealLabel(meal).toLowerCase().replace(/^./, (letter) => letter.toUpperCase())}</option>`).join("")}
      </select></label>
      <button class="primary-button" type="button" data-reuse-action="add-saved-meal">Add meal</button>
      <div class="food-reuse-management"><button type="button" data-reuse-action="rename-saved-meal">Rename</button><button type="button" class="is-destructive" data-reuse-action="delete-saved-meal">Delete saved meal</button></div>`;
    if (mediaIdValid(savedMeal.coverImageId)) elements.foodReuseContent.prepend(platePhotoRow(savedMeal.coverImageId,'Saved meal photo','Representative cover · View photo',`View saved meal photo for ${savedMeal.name}`));
  }
}

function beginSavedMealRename() {
  if (!savedMeals.some((meal) => meal.id === foodReuseState.savedMealId)) return;
  foodReuseState.renameTarget = elements.foodReuseContent.querySelector("[data-saved-meal-target]")?.value;
  foodReuseState.view = "rename-saved-meal";
  renderFoodReusePanel();
  const input = elements.foodReuseContent.querySelector("[name='mealName']");
  input?.focus({ preventScroll: true });
  input?.select();
}

function returnFromSavedMealRename() {
  foodReuseState.view = "saved-meal-review";
  renderFoodReusePanel();
  const target = elements.foodReuseContent.querySelector("[data-saved-meal-target]");
  if (target && foodReuseState.renameTarget) target.value = foodReuseState.renameTarget;
  delete foodReuseState.renameTarget;
  elements.foodReuseContent.querySelector('[data-reuse-action="rename-saved-meal"]')?.focus({ preventScroll: true });
}

function submitSavedMealRename(form) {
  if (foodReuseState.view !== "rename-saved-meal") return;
  const input = form.querySelector("[name='mealName']");
  const name = String(input.value || "").trim();
  if (!name) {
    input.setAttribute("aria-invalid", "true");
    setFoodReuseStatus("Enter a meal name.", true);
    input.focus({ preventScroll: true });
    return;
  }
  input.removeAttribute("aria-invalid");
  if (!savedMeals.some((meal) => meal.id === foodReuseState.savedMealId)) return;
  const previousSavedMeals = savedMeals;
  savedMeals = savedMeals.map((meal) => meal.id === foodReuseState.savedMealId ? { ...meal, name, updatedAt: new Date().toISOString() } : meal);
  try {
    if (localStorage.setItemConfirmed) localStorage.setItemConfirmed(savedMealLibraryKey, JSON.stringify(savedMeals));
    else saveSavedMeals();
  } catch {
    savedMeals = previousSavedMeals;
    setFoodReuseStatus("The meal could not be renamed. Please try again.", true);
    return;
  }
  renderSavedFoods();
  returnFromSavedMealRename();
}

function copyFoodEntries(entries, { sourceDate = "", targetMeal = null, successMessage = "Foods added." } = {}) {
  if (foodReuseState.copyBusy || !foodReuseState.open) return false;
  if (!entries.length) { setFoodReuseStatus("No food logged on this day.", true); return false; }
  foodReuseState.copyBusy = true;
  const targetDay = currentDay();
  let copiedFoods, nextFoodLibrary;
  try {
    // Optional legacy metadata may be absent, but never fabricate nutrition for
    // a broken record. Validate the entire batch before generating or writing it.
    if (entries.some(food => !String(food?.name || "").trim()
      || ["calories", "protein", "carbs", "fat"].some(key =>
        !["number", "string"].includes(typeof food[key]) || String(food[key]).trim() === ""
        || !Number.isFinite(Number(food[key])) || Number(food[key]) < 0)
      || food.amount != null && (!Number.isFinite(Number(food.amount)) || Number(food.amount) <= 0))) {
      const error = new Error("Invalid source food"); error.code = "invalid-copy-source"; throw error;
    }
    const identifiedFoods = entries.map(food => ({
      ...foodPersistence.ensureStableFoodIdentity(food),
      ...(!food.catalogId && /^(?:usda|off)-/i.test(String(food.id || "")) ? { catalogId: food.id } : {}),
    }));
    copiedFoods = foodReuse.cloneFoodEntries(identifiedFoods, {
      targetDate: state.selectedDate,
      targetMeal,
      sourceDate,
      excludedFromStreak: isFutureDateKey(state.selectedDate),
      idFactory: () => localRecordId(),
    });
    nextFoodLibrary = foodPersistence.updateRecentFoods(foodLibrary, copiedFoods.map(food => normalizeFoodForLibrary({
      ...food,
      source: foodSource(food) || "Manual",
      lastUsedAmount: food.amount,
      lastUsedUnit: food.unit,
    })), { now: new Date().toISOString(), maximum: maxRecentFoodItems });
    // One confirmed state-key write contains the whole batch. Publish only once
    // it succeeds; failed validation/IDs/storage never need a compensating write.
    state = commitDiaryDay(localStorage, state, { ...targetDay, foods: [...copiedFoods, ...targetDay.foods] });
  } catch (error) {
    setFoodReuseStatus(error.code === "invalid-copy-source"
      ? "A source food has incomplete nutrition. Edit it before copying."
      : "The foods could not be saved on this device. Please try again.", true);
    return false;
  } finally {
    foodReuseState.copyBusy = false;
  }
  // Recent is a derived cache. SafeStorage retains/warns about a failed cache
  // write; it must not turn an already committed diary batch into a retry.
  foodLibrary = nextFoodLibrary;
  saveFoodLibrary();
  if (editingFoodId) resetFoodForm();
  closeFoodReusePanel({ restoreFocus: false });
  recentSuccess = { collection: "foods", ids: copiedFoods.map(food => food.id), message: targetMeal
    ? `Meal added to ${mealLabel(targetMeal).toLowerCase()}.` : successMessage };
  render();
  elements.searchNote.textContent = successMessage;
  return true;
}

async function copyFoodsWithPhotos(entries, options = {}) {
  // Historical photos are not photographs of the new occurrence. The pure
  // clone helper removes occurrence/capture/cover references, not source data.
  return copyFoodEntries(entries, options);
}

function confirmAndCopyFoods(entries, options = {}) {
  if (!entries.length) return false;
  if (entries.length > 2) {
    const sourceLabel = options.sourceDate ? formatReuseDate(options.sourceDate) : "this meal";
    const targetLabel = formatReuseDate(state.selectedDate);
    if (!window.confirm(`Add ${entries.length} foods from ${sourceLabel} to ${targetLabel}?`)) return false;
  }
  return copyFoodsWithPhotos(entries, options);
}

function persistSavedMeal({ name, meal, foods, coverImageId = sharedPlateCover(foods || []) }) {
  if (!String(name || "").trim() || !Array.isArray(foods) || !foods.length) return null;
  const identifiedFoods = foods.map((food) => foodPersistence.ensureStableFoodIdentity(food));
  const savedMeal = foodReuse.createSavedMeal({ name, meal, foods: identifiedFoods, coverImageId });
  const previousSavedMeals = savedMeals;
  savedMeals = [savedMeal, ...savedMeals];
  try {
    saveSavedMeals();
  } catch {
    savedMeals = previousSavedMeals;
    return null;
  }
  renderSavedFoods();
  return savedMeal;
}

async function saveMealFromSelectedGroup(name) {
  const group = foodMealGroups(state.selectedDate).find((item) => item.meal === foodReuseState.selectedMeal);
  if (!group || !String(name || "").trim() || groupMealSaveBusy) return false;
  groupMealSaveBusy = true;
  const date = state.selectedDate, view = foodReuseState.view, coverImageId = sharedPlateCover(group.foods);
  try {
    return await withFoodPhotos([coverImageId], kept => {
      if (!isActive() || state.selectedDate !== date || !foodReuseState.open || foodReuseState.view !== view) return false;
      if (coverImageId && !kept.has(coverImageId)) throw Error('Meal photo is no longer available.');
      const savedMeal = persistSavedMeal({ name, meal: group.meal, foods: group.foods, coverImageId });
      if (!savedMeal) throw Error('Could not save meal.');
      closeFoodReusePanel({ restoreFocus: false });
      elements.searchNote.textContent = `${savedMeal.name} saved as a meal.`;
      return true;
    });
  } catch {
    setFoodReuseStatus("The meal could not be saved. Please try again.", true);
    return false;
  } finally { groupMealSaveBusy = false; }
}

async function saveMealFromScanReview(name) {
  if (scanMealSaveBusy) return false;
  scanMealSaveBusy=true;
  const generation=scanDraftGeneration;let coverImageId,lease;
  try {
  const meal = foodReuseState.selectedMeal || elements.foodMeal.value || defaultMealForNow();
  const foods = selectedScannedFoods().map((food) => scannedFoodToReusableEntry(food, meal));
  if (scannedFoodAnalysis?.inputMode==='photo') coverImageId=await captureDraft.stage(await photoEditor.ready());
  if (!isActive() || generation!==scanDraftGeneration || foodReuseState.view!=='save-scan-meal-name' || !foodReuseState.open) return false;
  if (coverImageId) lease=await foodMedia.hold([coverImageId]);
  if(coverImageId && !lease.ids.includes(coverImageId)){captureDraft.clear();throw Error('Photo is no longer available.');}
  if(!isActive() || generation!==scanDraftGeneration || !foodReuseState.open || foodReuseState.view!=='save-scan-meal-name')return false;
  const savedMeal = persistSavedMeal({ name, meal, foods, coverImageId });
  if (!savedMeal) {
    setFoodReuseStatus("The meal could not be saved. Please try again.", true);
    return false;
  }
  closeFoodReusePanel({ restoreFocus: false });
  elements.scanSaveMealStatus.textContent = "Meal saved";
  elements.scanSaveAsMeal.focus({ preventScroll: true });
  return true;
  } catch { if(isActive())setFoodReuseStatus('The meal could not be saved. Please try again.',true);return false; }
  finally { scanMealSaveBusy=false;await lease?.release().catch(()=>{});if(coverImageId)await foodMedia.settle([coverImageId],{recovery:hasRecoverablePhoto(coverImageId)}).catch(()=>{});collectFoodMediaSoon(); }
}

function openSavedMealReview(savedMealId) {
  foodReuseState.savedMealReturnView = foodReuseState.open && foodReuseState.view === 'saved-meals' ? 'saved-meals' : null;
  openFoodReusePanel("saved-meal-review", { savedMealId });
}

function updateSavedLibraryHint() {
  const hint = document.querySelector("#savedLibraryHint");
  if (hint) {
    hint.textContent = foodReuse.savedLibraryHint(savedMeals.length, savedFoods.length, foodSearchFilter);
    hint.hidden = !hint.textContent;
  }
}

function renderSavedFoods() {
  updateSavedLibraryHint();
  refreshReuseSuggestions();
  if (!elements.savedFoods) return;
  elements.savedFoods.innerHTML = "";
  if (elements.savedMeals) elements.savedMeals.innerHTML = "";
  if (elements.recentFoods) elements.recentFoods.innerHTML = "";

  if (elements.savedMealsSection) elements.savedMealsSection.hidden = savedMeals.length === 0;
  if (elements.savedFoodsSection) elements.savedFoodsSection.hidden = savedFoods.length === 0 && savedMeals.length > 0;
  savedMeals.forEach((savedMeal) => elements.savedMeals?.appendChild(createSavedMealCard(savedMeal)));

  if (!savedFoods.length) {
    elements.savedFoods.innerHTML = "<div class=\"saved-foods-empty\">Save foods from your daily log and they will appear here.</div>";
  } else {
    savedFoods.forEach((food) => {
      elements.savedFoods.appendChild(createLibraryFoodCard(food, { saved: true }));
    });
  }

  if (!elements.recentFoods) return;
  const recentFoods = uniqueRecentFoods(foodLibrary);
  if (!recentFoods.length) {
    elements.recentFoods.innerHTML = "<div class=\"saved-foods-empty\">Recently logged foods will appear here.</div>";
    return;
  }
  recentFoods.forEach((food) => {
    elements.recentFoods.appendChild(createLibraryFoodCard(food, { saved: false }));
  });
}

function closeInlineEntryActions(exceptCard = null) {
  document.querySelectorAll(".entry-card.is-actions-open").forEach((entryCard) => {
    if (entryCard === exceptCard) return;
    entryCard.classList.remove("is-actions-open");
    const actions = entryCard.querySelector(".entry-inline-actions");
    if (actions) actions.hidden = true;
    entryCard.querySelector(".entry-actions-toggle")?.setAttribute("aria-expanded", "false");
  });
}

function createSavedMealCard(savedMeal, { compact = false } = {}) {
  const calories = savedMeal.foods.reduce((sum, food) => sum + Number(food.calories || 0), 0);
  const card = document.createElement("button");
  card.type = "button";
  card.dataset.savedMealId = savedMeal.id;
  card.className = `saved-meal-card${compact ? " is-compact" : ""}`;
  card.innerHTML = `<span><strong>${escapeHtml(savedMeal.name)}</strong><small>${savedMeal.foods.length} ${savedMeal.foods.length === 1 ? "food" : "foods"} · ${Math.round(calories)} kcal</small></span><span aria-hidden="true">→</span>`;
  const cover=thumbnails.image(savedMeal.coverImageId);if(cover)card.prepend(cover);
  card.addEventListener("click", () => openSavedMealReview(savedMeal.id));
  return card;
}

function createLibraryFoodCard(food, { saved }) {
  const kept = isFoodSaved(food);
  const portionLabel = Number(food.lastUsedAmount || 0) > 0 && food.lastUsedUnit
    ? formatScannedFoodPortion({ amount: food.lastUsedAmount, unit: food.lastUsedUnit })
    : food.serving;
  const card = document.createElement("div");
  card.className = `saved-food-chip${saved ? "" : " recent-food-chip"}`;
  card.innerHTML = `
    ${saved ? "" : `<div class="recent-food-swipe-actions" aria-hidden="true"><button class="recent-food-delete-action" type="button" tabindex="-1">×</button></div>`}
    <div class="saved-food-surface">
      <button class="saved-food-load" type="button">
        <strong>${escapeHtml(formatFoodDisplayName(food))}</strong>
        <span>${escapeHtml(portionLabel)} · ${Math.round(food.calories)} kcal</span>
      </button>
      <button class="saved-food-heart ${kept ? "is-saved" : ""}" type="button" aria-pressed="${kept}" title="${kept ? "Unsave food" : "Save food"}" aria-label="${kept ? "Unsave food" : "Save food"}">${kept ? "♥" : "♡"}</button>
    </div>
  `;
  card.querySelector(".saved-food-load").addEventListener("click", () => {
    if (card.dataset.suppressClick === "true") {
      delete card.dataset.suppressClick;
      return;
    }
    if (card.classList.contains("is-swiped-left")) {
      closeRecentFoodSwipes();
      return;
    }
    elements.foodSection.classList.remove("is-viewing-saved");
    fillManualFood(food);
    elements.foodAmount.focus();
  });
  card.querySelector(".saved-food-heart").addEventListener("click", () => toggleSavedFood(food));
  const thumbnail = thumbnails.button(saved ? food.coverImageId : food.photoMediaId, formatFoodDisplayName(food));
  if (thumbnail) { const surface = card.querySelector('.saved-food-surface'); surface.classList.add('has-food-photo'); surface.prepend(thumbnail); }
  if (!saved) {
    card.querySelector(".recent-food-delete-action").addEventListener("click", (event) => {
      event.stopPropagation();
      removeRecentFoodWithUndo(food);
    });
    attachRecentFoodSwipe(card, food);
  }
  return card;
}

function closeRecentFoodSwipes(exceptCard = null) {
  document.querySelectorAll(".recent-food-chip.is-swiped-left").forEach((card) => {
    if (card === exceptCard) return;
    card.classList.remove("is-swiped-left", "is-dragging");
    card.style.removeProperty("--swipe-x");
  });
}

async function removeRecentFoodWithUndo(food) {
  let photoLease;
  if (mediaIdValid(food.photoMediaId)) {
    try { photoLease = await holdUndoPhotos([food.photoMediaId]); } catch { foodPhotoNotice('Could not protect this photo for Undo. Please try again.'); return; }
    if (!isActive()) { photoLease?.release(); return; }
  }
  const previousFoodLibrary = foodLibrary;
  const key = recentFoodKey(food);
  const index = foodLibrary.findIndex(item => recentFoodKey(item) === key);
  if (index < 0) { photoLease?.release(); return; }
  foodLibrary = foodLibrary.filter((recentFood) => recentFoodKey(recentFood) !== key);
  try { persistRecentEdit(); } catch { photoLease?.release(); foodLibrary = previousFoodLibrary; elements.searchNote.textContent = "Recent food could not be removed. Please try again."; return; }
  renderSavedFoods();
  showUndoToast("Recent food removed.", () => {
    const current = foodLibrary;
    foodLibrary = foodReuse.restoreRemovedItem(foodLibrary, previousFoodLibrary[index], index, recentFoodKey);
    try { persistRecentEdit(); } catch { foodLibrary = current; elements.searchNote.textContent = "Recent food could not be restored. Please try again."; }
    renderSavedFoods();
    focusReuseFood(key);
  }, { reuse: true, photoLease });
  collectFoodMediaSoon();
  focusReuseFood();
}

function persistRecentEdit() {
  if (localStorage.setItemConfirmed) localStorage.setItemConfirmed(foodLibraryKey, JSON.stringify(foodLibrary));
  else saveFoodLibrary();
}

function focusReuseFood(key) {
  const row = [...elements.foodSuggestions.querySelectorAll('[data-reuse-food]')].find(row => row.dataset.reuseFood === key);
  (row?.querySelector('.suggestion-card') || elements.manualFoodName)?.focus({preventScroll:true});
}

function refreshReuseSuggestions() {
  if (!elements.foodSection.classList.contains('is-adding') || elements.foodSection.classList.contains('is-detailing')) return;
  const scroll = elements.foodSection.scrollTop;
  if (!showBrowseFoodSuggestions()) renderSuggestions(latestFoodSuggestions, {remember:false,preserveLimit:true});
  elements.foodSection.scrollTop = scroll;
}

function createReuseFoodRow(food, { recent = false, preview = false } = {}) {
  const row = document.createElement('div'); row.className = 'reuse-food-row'; row.dataset.reuseFood = foodIdentityKey(food);
  if (recent && !preview) return createRecentManagementRow(row, food);
  row.appendChild(createFoodSuggestionCard(food));
  if (preview) { row.classList.add('is-recent-preview'); return row; }
  const actions = document.createElement('div'); actions.className = 'reuse-food-actions';
  const saved = isFoodSaved(food), save = document.createElement('button'); save.type = 'button'; save.dataset.reuseSave = '';
  save.textContent = saved ? 'Unsave' : 'Save'; save.setAttribute('aria-label', `${saved ? 'Unsave' : 'Save'} ${formatFoodDisplayName(food)}`); save.setAttribute('aria-pressed', String(saved));
  save.addEventListener('click', () => { toggleSavedFood(food); focusReuseFood(foodIdentityKey(food)); }); actions.appendChild(save);
  row.appendChild(actions); return row;
}

function runRecentFoodAction(action, food) {
  if (action === 'remove') removeRecentFoodWithUndo(food);
  else {
    toggleSavedFood(food);
    const row = [...elements.foodSuggestions.querySelectorAll('[data-reuse-food]')].find(item => item.dataset.reuseFood === foodIdentityKey(food));
    row?.querySelector('.reuse-food-overflow')?.focus({ preventScroll: true });
  }
}

function createRecentManagementRow(row, food) {
  row.classList.add('is-recent');
  row.innerHTML = '<div class="reuse-food-surface"></div>';
  const surface = row.querySelector('.reuse-food-surface');
  surface.appendChild(createFoodSuggestionCard(food));
  const overflow = document.createElement('button');
  overflow.type = 'button'; overflow.className = 'reuse-food-overflow'; overflow.textContent = '…';
  overflow.setAttribute('aria-label', `Actions for ${formatFoodDisplayName(food)}`);
  overflow.setAttribute('aria-haspopup', 'dialog'); overflow.setAttribute('aria-controls', 'foodReusePanel'); overflow.setAttribute('aria-expanded', 'false');
  surface.appendChild(overflow);
  overflow.addEventListener('click', () => {
    openFoodReusePanel('recent-actions', { recentFoodKey: foodIdentityKey(food), opener: overflow });
    overflow.setAttribute('aria-expanded', 'true');
  });
  return row;
}

function attachRecentFoodSwipe(card, food) {
  let startX = 0;
  let startY = 0;
  let latestX = 0;
  let isTracking = false;
  let isDragging = false;
  const revealDistance = 78;
  const dragLimit = 92;

  function setSwipeOffset(value) {
    const offset = Math.max(-dragLimit, Math.min(0, value));
    card.style.setProperty("--swipe-x", `${offset}px`);
  }

  card.addEventListener("pointerdown", (event) => {
    if (event.target.closest(".saved-food-heart, .recent-food-delete-action")) return;
    closeRecentFoodSwipes(card);
    startX = event.clientX;
    startY = event.clientY;
    latestX = startX;
    isTracking = true;
    isDragging = false;
    card.classList.remove("is-swiped-left");
  });

  card.addEventListener("pointermove", (event) => {
    if (!isTracking) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    if (!isDragging && Math.abs(deltaX) < 10) return;
    if (!isDragging && Math.abs(deltaY) > Math.abs(deltaX)) {
      isTracking = false;
      return;
    }
    isDragging = true;
    latestX = event.clientX;
    card.classList.add("is-dragging");
    setSwipeOffset(deltaX);
  });

  card.addEventListener("pointerup", (event) => {
    if (!isTracking) return;
    isTracking = false;
    const deltaX = (isDragging ? latestX : event.clientX) - startX;
    const deltaY = event.clientY - startY;
    card.classList.remove("is-dragging");
    card.style.removeProperty("--swipe-x");
    if (Math.abs(deltaY) > 44 || deltaX > -52) {
      if (card.classList.contains("is-swiped-left")) {
        card.dataset.suppressClick = "true";
        setTimeout(() => {
          delete card.dataset.suppressClick;
        }, 220);
      }
      return;
    }

    card.dataset.suppressClick = "true";
    setTimeout(() => {
      delete card.dataset.suppressClick;
    }, 260);
    card.classList.add("is-swiped-left");
  });

  card.addEventListener("pointercancel", () => {
    isTracking = false;
    isDragging = false;
    card.classList.remove("is-dragging");
    card.style.removeProperty("--swipe-x");
  });
}

function sourceLabel(food) {
  const originalSource = foodSource(food);
  const source = String(originalSource || food.brand || "").toLowerCase();
  if (source.includes("ai estimate")) return "AI ESTIMATE";
  if (source.includes("openai photo") || source.includes("photo estimate")) return "PHOTO ESTIMATE";
  if (source.includes("open food facts") || source === "off") return "OPEN FOOD FACTS";
  if (source.includes("usda")) return "USDA";
  if (source.includes("manual")) return "MANUAL";
  if (source.includes("starter") || source.includes("local")) return "STARTER";
  return originalSource ? originalSource.toUpperCase() : "";
}

function foodMatchesActiveFilter(food) {
  const source = String(food.source || food.brand || "").toLowerCase();
  if (foodSearchFilter === "my") return isFoodSaved(food) || source.includes("saved");
  if (foodSearchFilter === "recent") return foodLibrary.some((recentFood) => recentFoodKey(recentFood) === recentFoodKey(food));
  if (foodSearchFilter === "usda") return source.includes("usda");
  if (foodSearchFilter === "off") return source.includes("open food facts") || source === "off";
  return true;
}

function activeFoodFilterLabel() {
  const labels = {
    my: "saved foods",
    recent: "recent foods",
    usda: "USDA",
    off: "products",
  };
  return labels[foodSearchFilter] || "";
}

function updateFoodFilterTabs() {
  updateSavedLibraryHint();
  // The real pane keeps its source identity even while its contents are empty.
  elements.searchNote.closest('.food-filter-pane').dataset.peerFilter = foodSearchFilter;
  elements.foodFilterTabs.forEach((button) => {
    const isActive = button.dataset.foodFilter === foodSearchFilter;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
  window.IntakeMotion?.selection(elements.foodFilterTabs, 'underline');
}

function foodSearchSummary(count, total = count) {
  const query = elements.manualFoodName.value.trim();
  if (!query && foodSearchFilter === "my") {
    const foodCopy = `${savedFoods.length} saved ${savedFoods.length === 1 ? "food" : "foods"}`;
    const mealCopy = `${savedMeals.length} saved ${savedMeals.length === 1 ? "meal" : "meals"}`;
    return savedMeals.length ? `${mealCopy} · ${foodCopy}` : foodCopy;
  }
  if (!query && foodSearchFilter === "recent") return `${count} recent ${count === 1 ? "food" : "foods"}`;
  if (!query) return "Search saved foods, USDA, or Open Food Facts.";
  if (!count) {
    const source = activeFoodFilterLabel();
    return source ? `0 ${source} matches for "${query}"` : `0 matches for "${query}"`;
  }
  if (total > count) return `Showing ${count} of ${total} matches for "${query}"`;
  return `${count} ${count === 1 ? "match" : "matches"} for "${query}"`;
}

function showBrowseFoodSuggestions() {
  if (elements.manualFoodName.value.trim()) return false;

  if (foodSearchFilter === "my") {
    renderSavedFoodSuggestions();
    return true;
  }

  if (foodSearchFilter === "recent") {
    renderSuggestions(foodLibrary, { remember: false });
    return true;
  }

  if (foodSearchFilter === "all") {
    renderRecentFoodSuggestions();
    return true;
  }

  elements.foodSuggestions.innerHTML = "";
  latestFoodSuggestions = [];
  elements.foodSection.classList.remove("has-food-suggestions");
  elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
  setFoodSearchActive(false);
  return true;
}

function renderSavedFoodSuggestions() {
  elements.foodSection.classList.remove("has-search-fallback");
  elements.foodSuggestions.innerHTML = "";
  latestFoodSuggestions = [];
  setFoodSearchActive(false);

  {
    const heading = document.createElement("p");
    heading.className = "food-suggestion-section-label label";
    heading.textContent = "Saved meals";
    elements.foodSuggestions.appendChild(heading);
    savedMeals.forEach((meal) => elements.foodSuggestions.appendChild(createSavedMealCard(meal, { compact: true })));
    if (!savedMeals.length) appendReuseEmpty('Meals you save for reuse will appear here.');
  }

  {
    const heading = document.createElement("p");
    heading.className = "food-suggestion-section-label label";
    heading.textContent = "Saved foods";
    elements.foodSuggestions.appendChild(heading);
    savedFoods.forEach((food) => elements.foodSuggestions.appendChild(createReuseFoodRow(food)));
    if (!savedFoods.length) appendReuseEmpty('Foods you explicitly save will appear here.', true);
  }
  elements.foodSection.classList.add("has-food-suggestions");
  elements.searchNote.textContent = foodSearchSummary(savedFoods.length);
}

function appendReuseEmpty(message, search = false) {
  const empty = document.createElement('div'); empty.className = 'reuse-empty';
  const copy = document.createElement('p'); copy.textContent = message; empty.appendChild(copy);
  if (search) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = 'Search foods'; button.dataset.reuseSearch = '';
    button.addEventListener('click', () => { foodSearchFilter = 'all'; updateFoodFilterTabs(); showBrowseFoodSuggestions(); elements.manualFoodName.focus(); }); empty.appendChild(button);
  }
  elements.foodSuggestions.appendChild(empty); elements.foodSection.classList.add('has-food-suggestions');
}

function renderRecentFoodSuggestions() {
  const recentFoods = uniqueRecentFoods(foodLibrary).slice(0, 4);
  elements.foodSection.classList.remove("has-search-fallback");
  elements.foodSuggestions.innerHTML = "";
  latestFoodSuggestions = [];
  setFoodSearchActive(false);

  const hasSaved = savedMeals.length > 0 || savedFoods.length > 0;
  if (hasSaved) {
    const saved = document.createElement("button");
    saved.type = "button";
    saved.className = "search-saved-entry";
    saved.innerHTML = '<span>Saved meals & foods</span><span aria-hidden="true">→</span>';
    saved.addEventListener("click", () => {
      selectFoodFilter("my");
    });
    elements.foodSuggestions.appendChild(saved);
  }
  if (!recentFoods.length) {
    elements.foodSection.classList.toggle("has-food-suggestions", hasSaved);
    elements.searchNote.textContent = "Search for a food, or add it manually.";
    return;
  }

  const heading = document.createElement("div");
  heading.className = "recent-foods-heading";
  const title = document.createElement("span");
  title.textContent = "Recent foods";
  const viewAll = document.createElement("button");
  viewAll.type = "button";
  viewAll.textContent = "View all →";
  viewAll.setAttribute('aria-label', 'View all Recent foods');
  viewAll.addEventListener("click", () => {
    selectFoodFilter("recent");
  });
  heading.append(title, viewAll);
  elements.foodSuggestions.appendChild(heading);
  recentFoods.forEach((food) => elements.foodSuggestions.appendChild(createReuseFoodRow(food, {recent:true, preview:true})));
  elements.foodSection.classList.add("has-food-suggestions");
  elements.searchNote.textContent = "";
}

function addSuggestedFood(food) {
  const portion = parseServing(food.serving);
  addFood({
    catalogId: food.catalogId || "",
    sourceId: food.sourceId || "",
    localFoodId: food.localFoodId || "",
    reusableFoodId: food.reusableFoodId || "",
    name: food.name,
    ...(food.nameEdited === true ? { nameEdited: true } : {}),
    brand: food.brand || "",
    source: food.source || "Recent",
    nutritionSource: food.nutritionSource || "",
    resolvedFoodName: food.resolvedFoodName || food.name,
    serving: food.serving || "",
    amount: 1,
    unit: "serving",
    servingGrams: Number(food.servingGrams || portion.grams || 0) || null,
    meal: defaultMealForNow(),
    calories: Number(food.calories || 0),
    protein: Number(food.protein || 0),
    carbs: Number(food.carbs || 0),
    fat: Number(food.fat || 0),
  });
  elements.searchNote.textContent = `${formatFoodDisplayName(food)} added.`;
  playSubmitSuccess(elements.floatingAddButton || elements.manualFoodSubmit);
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
}

function renderSuggestions(foods, options = {}) {
  const { remember = true, preserveLimit = false } = options;
  const sourceFoods = [...foods];
  if (remember) latestFoodSuggestions = sourceFoods;
  if (!preserveLimit) foodSuggestionVisibleCount = 5;
  elements.foodSection.classList.remove("has-search-fallback");
  elements.foodSuggestions.innerHTML = "";
  const filteredFoods = rankFoodSuggestions(
    sourceFoods.filter(foodMatchesActiveFilter),
    elements.manualFoodName.value,
  );
  const hasSearch = elements.manualFoodName.value.trim().length >= 2;
  elements.foodSection.classList.toggle("has-food-suggestions", filteredFoods.length > 0);

  if (!filteredFoods.length) {
    if (!hasSearch && foodSearchFilter === 'recent') {
      appendReuseEmpty('Recently logged foods will appear here.'); elements.searchNote.textContent = 'No Recent foods yet.'; setFoodSearchActive(false); return;
    }
    if (elements.manualFoodName.value.trim().length < 2 && foodSearchFilter === "my") {
      elements.searchNote.textContent = "No saved foods yet. Save foods with the heart.";
      setFoodSearchActive(false);
      return;
    }
    elements.searchNote.textContent = hasSearch ? foodSearchSummary(0) : "Search saved foods, USDA, or Open Food Facts.";
    if (hasSearch) renderFoodSearchFallbacks();
    setFoodSearchActive(hasSearch);
    return;
  }

  const visibleFoods = filteredFoods.slice(0, foodSuggestionVisibleCount);
  elements.searchNote.textContent = foodSearchSummary(visibleFoods.length, filteredFoods.length);
  setFoodSearchActive(hasSearch);

  visibleFoods.forEach((food) => elements.foodSuggestions.appendChild(['my','recent'].includes(foodSearchFilter)
    ? createReuseFoodRow(food, {recent:foodSearchFilter==='recent'}) : createFoodSuggestionCard(food)));

  if (visibleFoods.length < filteredFoods.length) {
    const showMoreButton = document.createElement("button");
    showMoreButton.className = "food-suggestions-more";
    showMoreButton.type = "button";
    showMoreButton.textContent = `Show ${filteredFoods.length - visibleFoods.length} more`;
    showMoreButton.addEventListener("click", () => {
      foodSuggestionVisibleCount = filteredFoods.length;
      renderSuggestions(sourceFoods, { remember: false, preserveLimit: true });
    });
    elements.foodSuggestions.appendChild(showMoreButton);
  }
}

function createFoodSuggestionCard(food) {
  const button = document.createElement("button");
  button.className = "suggestion-card";
  button.type = "button";
  button.innerHTML = `
    <div>
      <strong>${escapeHtml(formatFoodDisplayName(food))}</strong>
      <p></p>
    </div>
    <span class="suggestion-kcal">${Math.round(food.calories)} kcal</span>
  `;
  const meta = button.querySelector("p");
  meta.className = "suggestion-meta";
  meta.textContent = foodResultMetadata(food, foodServingLabel(food), sourceLabel(food));
  meta.title = meta.textContent;
  button.setAttribute("aria-label", `${formatFoodDisplayName(food)}, ${meta.textContent}, ${Math.round(food.calories)} kcal${isFoodSaved(food) ? ', Saved' : ''}`);
  if (isFoodSaved(food)) {
    const saved = document.createElement("small");
    saved.className = "suggestion-saved";
    saved.textContent = "Saved";
    meta.append(saved);
  }
  button.addEventListener("click", () => fillManualFood(food));
  const thumbnail = thumbnails.button(food.coverImageId || food.photoMediaId, formatFoodDisplayName(food));
  if (thumbnail) { const row = document.createElement('div'); row.className = 'food-photo-result'; row.append(thumbnail, button); return row; }
  return button;
}

function renderFoodSearchFallbacks() {
  elements.foodSection.classList.add("has-search-fallback");
  const emptyTitle = {
    my: "Not in Saved",
    recent: "Not in Recent",
    usda: "No USDA match",
    off: "No product match",
  }[foodSearchFilter] || "No exact match";
  const emptyHint = foodSearchFilter === "all" ? "Try a different name, or add this food yourself." : foodSearchFilter === "off"
    ? "Try a brand name, or search all sources."
    : "Try all sources, or add this food yourself.";
  const actions = document.createElement("div");
  actions.className = "food-search-fallbacks";
  actions.setAttribute("aria-live", "polite");
  actions.innerHTML = `<div class="food-search-fallback-copy"><strong>${emptyTitle}</strong><p>${emptyHint}</p></div><div><button type="button" data-food-fallback="all">Search all sources</button><button type="button" data-food-fallback="manual">Add manually</button></div>`;
  const enteredName = elements.manualFoodName.value.trim();
  if (enteredName) {
    const compactName = enteredName.length > 28 ? `${enteredName.slice(0, 27).trimEnd()}…` : enteredName;
    const manualButton = actions.querySelector('[data-food-fallback="manual"]');
    manualButton.textContent = `Add “${compactName}” manually`;
    manualButton.title = `Add “${enteredName}” manually`;
  }
  actions.querySelector('[data-food-fallback="all"]').hidden = foodSearchFilter === "all";
  actions.querySelector('[data-food-fallback="all"]').addEventListener("click", () => {
    foodSearchFilter = "all";
    updateFoodFilterTabs();
    renderSuggestions(latestFoodSuggestions);
  });
  actions.querySelector('[data-food-fallback="manual"]').addEventListener("click", () => {
    const name = elements.manualFoodName.value.trim();
    fillManualFood({ name, source: "Manual", serving: "1 serving", servingGrams: null, calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  elements.foodSuggestions.appendChild(actions);
}

function usefulFoodDescription() {
  const description = elements.foodAiDescriptionInput?.value.trim() || "";
  return description.length >= 3 && /[\p{L}\p{N}]/u.test(description);
}

function syncFoodAiDescriptionState() {
  if (!elements.foodAiDescriptionSubmit) return;
  elements.foodAiDescriptionSubmit.disabled = aiDescriptionPending || !usefulFoodDescription();
  elements.foodAiDescriptionInput.disabled = aiDescriptionPending;
  elements.foodAiDescriptionBack.disabled = false;
  elements.foodAiDescriptionRetry.disabled = aiDescriptionPending;
  elements.foodAiDescriptionManual.disabled = aiDescriptionPending;
  elements.foodAiDescription.classList.toggle("is-estimating", aiDescriptionPending);
  elements.foodAiDescription.setAttribute("aria-busy", String(aiDescriptionPending));
}

function openFoodAiDescription() {
  if (isPhoneAddFoodLayout() && !scannedFoodItems.length && !elements.foodSection.matches('.is-detailing,.is-reviewing-scan,.is-describing-ai')) addSurface.captureParent('description');
  elements.foodSection.classList.add("is-describing-ai");
  elements.foodAiDescription.hidden = false;
  elements.foodAiDescriptionTrigger.setAttribute("aria-expanded", "true");
  elements.foodAiDescriptionError.hidden = true;
  elements.foodAiDescriptionStatus.textContent = "";

  syncFoodAiDescriptionState();
  // This click explicitly enters a typing flow. Keep focus inside the user
  // activation instead of deferring it beyond iOS keyboard permission.
  elements.foodAiDescriptionInput.focus({ preventScroll: true });
}

function closeFoodAiDescription({ clear = false } = {}) {
  addSurface.forgetParent('description');
  addSurface.forgetParent('plate-summary');
  aiDescriptionController?.abort();
  aiDescriptionController = null;
  aiDescriptionPending = false;
  elements.foodAiDescriptionSubmit.textContent = "Estimate nutrition";
  elements.foodSection.classList.remove("is-describing-ai");
  elements.foodAiDescription.hidden = true;
  elements.foodAiDescriptionTrigger.setAttribute("aria-expanded", "false");
  elements.foodAiDescriptionError.hidden = true;
  elements.foodAiDescriptionStatus.textContent = "";
  if (clear) elements.foodAiDescriptionInput.value = "";

  syncFoodAiDescriptionState();
}

function enterAiDescriptionManually() {
  const description = elements.foodAiDescriptionInput.value.trim();
  closeFoodAiDescription();
  fillManualFood({
    name: description.slice(0, 100),
    source: "Manual",
    serving: "1 serving",
    servingGrams: null,
    calories: 0,
    protein: 0,
    carbs: 0,
    fat: 0,
  }, { editableName: true });
  elements.foodEditName.textContent = "Manual food";
  elements.manualFoodName.focus();
}

async function estimateDescribedFood() {
  const description = elements.foodAiDescriptionInput.value.trim();
  if (!usefulFoodDescription() || aiDescriptionPending) {
    elements.foodAiDescriptionStatus.textContent = "Describe at least one food before estimating.";
    return;
  }

  aiDescriptionPending = true;
  const controller = new AbortController();
  aiDescriptionController = controller;
  elements.foodAiDescriptionError.hidden = true;
  elements.foodAiDescriptionStatus.textContent = "AI is estimating your foods, portions, and nutrition…";
  elements.foodAiDescriptionSubmit.textContent = "Estimating…";
  syncFoodAiDescriptionState();

  try {
    const response = await fetch("/api/foods/estimate-text", {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });
    const data = await response.json().catch(() => ({}));
    if (controller.signal.aborted || aiDescriptionController !== controller) return;
    if (!response.ok || !Array.isArray(data.analysis?.foods) || !data.analysis.foods.length) {
      throw new Error(data.error || "No food could be estimated. Add a little more detail or enter the nutrition manually.");
    }

    const analysis = {
      ...data.analysis,
      foods: data.analysis.foods.map((food) => ({ ...food, source: "AI ESTIMATE" })),
    };
    closeFoodAiDescription();
    showSimpleScannedPlate(analysis, "", { inputMode: "text", description });
    showScannedFoodsReview();
  } catch (error) {
    if (controller.signal.aborted || aiDescriptionController !== controller) return;
    elements.foodAiDescriptionStatus.textContent = "";
    const detail = elements.foodAiDescriptionError.querySelector?.("p");
    const title = elements.foodAiDescriptionError.querySelector?.("strong");
    const networkError = error instanceof TypeError || /failed to fetch|network|load failed/i.test(error.message || "");
    if (title) title.textContent = networkError ? "Couldn't connect to the server." : "Estimate unavailable.";
    if (detail) detail.textContent = networkError ? "Your description is still here. Check your connection and try again once the server is available." : error.message || "Please try again or enter the nutrition manually.";
    elements.foodAiDescriptionError.hidden = false;
  } finally {
    if (aiDescriptionController === controller) {
      aiDescriptionController = null;
      aiDescriptionPending = false;
      elements.foodAiDescriptionSubmit.textContent = "Estimate nutrition";
      syncFoodAiDescriptionState();
    }
  }
}

let mobileBrowseState = null;
function captureFoodBrowseState(container = elements.foodSection) {
  container=addSurface.content(container);
  return { query: elements.manualFoodName.value, filter: foodSearchFilter, scroll: container.scrollTop,
    foods: [...latestFoodSuggestions], limit: foodSuggestionVisibleCount, status: elements.searchNote.textContent,
    error: foodSearchError, pending: foodSearchPending, active: elements.foodSection.classList.contains("is-searching") };
}

function restoreFoodBrowseState(browse, container = elements.foodSection) {
  if (!browse) return;
  container=addSurface.content(container);
  resetFoodForm();
  foodSearchFilter = browse.filter;
  elements.manualFoodName.value = browse.query;
  elements.foodNameLabel.textContent = "Search food";
  foodSuggestionVisibleCount = browse.limit;
  updateFoodFilterTabs();
  if (!browse.query.trim() && browse.filter === "recent") renderSuggestions(foodLibrary, { remember: false, preserveLimit: true });
  else if (!showBrowseFoodSuggestions()) renderSuggestions(browse.foods, { preserveLimit: true });
  setFoodSearchActive(browse.active);
  if (browse.error) renderFoodSearchError(browse.error);
  else elements.searchNote.textContent = browse.status;
  syncSearchClear();
  container.scrollTop = browse.scroll;
  elements.closeFoodModal.focus({ preventScroll: true });
  if (isPhoneAddFoodLayout() && elements.foodSection.dataset.swipeBackCommitted !== 'true') animateFoodStep(container, 'back', window);
  if (browse.pending) searchFoodSuggestions(browse.query);
}
function fillManualFood(food, options = {}) {
  resetPhotoReview(food);
  if (!options.fromScanner) elements.manualFoodName.blur();
  elements.foodEditSummary.querySelector("span").textContent = "Food entry";
  if (isPhoneAddFoodLayout() && !elements.foodSection.classList.contains("is-detailing")) {
    mobileBrowseState = captureFoodBrowseState();
    addSurface.captureParent('browse');
    elements.closeFoodModal.setAttribute("aria-label", "Back to food search");
  }

  cancelFoodSearch();
  const portion = parseServing(food.serving);
  const isManualEntry = options.editableName === true || foodSource(food).toLowerCase() === "manual";
  elements.manualFoodForm.dataset.foodDetail = options.fromScanner ? "scan" : isManualEntry ? "manual" : "ordinary";
  const lastUsedUnit = ["serving", "piece", "g", "ml"].includes(food.lastUsedUnit) ? food.lastUsedUnit : "serving";
  const lastUsedAmount = Number(food.lastUsedAmount || 0);
  const servingGrams = Number(food.servingGrams || portion.grams || 0) || null;
  const servingMl = Number(food.servingMl || (portion.unit === "ml" ? portion.amount : 0)) || null;
  const baseNutrition = portionMath.storedFoodNutritionBasis({ ...food, servingGrams, servingMl });
  selectedFoodBase = {
    ...food,
    ...baseNutrition,
    servingGrams,
    servingMl,
  };

  elements.foodSection.classList.add("is-detailing");
  elements.foodSection.classList.toggle("is-manual-entry", isManualEntry);
  elements.foodNameLabel.textContent = isManualEntry ? "Food name (required)" : "Search food";
  foodNutritionOverridden = isManualEntry;
  foodNutritionEditing = false;
  elements.manualFoodName.readOnly = !isManualEntry;
  elements.manualFoodName.placeholder = isManualEntry ? "Food name" : "Search food";
  elements.manualFoodName.value = formatFoodDisplayName(food);
  elements.foodEditName.textContent = formatFoodDisplayName(food);
  syncFoodDetailBrand(options.fromScanner ? null : food);
  elements.foodEditSummary.querySelector("small").textContent = isManualEntry
    ? "Set the serving and nutrition, then add it to your log."
    : "Adjust serving and meal, or edit nutrition.";
  elements.foodAmount.value = lastUsedAmount > 0 ? lastUsedAmount : 1;
  elements.foodUnit.value = lastUsedUnit;
  syncFoodUnitOptions();
  syncFoodPortionNote();
  elements.foodMeal.value = defaultMealForNow();
  elements.manualFoodSubmit.textContent = "Add food";
  syncFoodSubmitLabel();
  elements.scanSimpleSaveActions.hidden = true;
  elements.scanSaveMealStatus.textContent = "";
  updateFoodAmountStep();
  elements.foodSuggestions.innerHTML = "";
  setFoodSearchActive(false);
  updateNutritionForPortion(true);
  syncFoodNutritionMode();

  elements.manualFoodSubmit.disabled = false;
  if (!options.fromScanner) {
    addSurface.reset(elements.foodSection);elements.foodSection.scrollTop = 0;

    (isPhoneAddFoodLayout()?elements.closeFoodModal:isManualEntry?elements.manualFoodName:elements.foodAmount).focus({ preventScroll: true });
    if (isPhoneAddFoodLayout()) animateFoodStep(addSurface.content(elements.foodSection), 'forward', window);
  }
}

function fillFoodFormForEdit(food) {
  resetPhotoReview(food, true);
  // Capture/lock the visible Today reading context before detail classes can
  // expand this still-in-flow section. The fields are populated in this same
  // turn, before the existing Add entrance paints its first frame.
  const phoneEditor = isPhoneAddFoodLayout();
  if (phoneEditor) openMobileLogForm(elements.foodSection, null, {nested:true});
  cancelFoodSearch();
  elements.manualFoodForm.dataset.foodDetail = "edit";
  elements.foodSection.classList.remove("is-manual-entry");
  editingFoodId = food.id;
  foodNutritionOverridden = Boolean(food.nutritionOverridden)
    || foodSource(food).toLowerCase() === "manual";
  foodNutritionEditing = false;
  const amount = Number(food.amount || 1);
  // A logged g/ml total is the basis for its measured amount, not one serving.
  const measuredUnit = food.unit === "g" || food.unit === "ml";
  const divisor = measuredUnit ? 1 : amount || 1;
  const portion = parseServing(food.serving);
  selectedFoodBase = {
    ...food,
    calories: food.unit === "g" ? Math.round(Number(food.calories || 0)) : Math.round(Number(food.calories || 0) / divisor),
    protein: food.unit === "g" ? roundNutritionValue(food.protein) : roundNutritionValue(Number(food.protein || 0) / divisor),
    carbs: food.unit === "g" ? roundNutritionValue(food.carbs) : roundNutritionValue(Number(food.carbs || 0) / divisor),
    fat: food.unit === "g" ? roundNutritionValue(food.fat) : roundNutritionValue(Number(food.fat || 0) / divisor),
    servingGrams: food.unit === "g"
      ? amount || 100
      : Number(food.servingGrams || portion.grams || 0) || null,
    servingMl: food.unit === "ml"
      ? amount
      : Number(food.servingMl || (portion.unit === "ml" ? portion.amount : 0)) || null,
  };
  elements.manualFoodName.value = formatFoodDisplayName(food);
  elements.manualFoodName.readOnly = true;
  elements.foodEditName.textContent = formatFoodDisplayName(food, "Food entry");
  syncFoodDetailBrand(food);
  elements.foodEditSummary.querySelector("small").textContent = "Adjust serving, meal, or nutrition values, then save.";
  elements.foodAmount.value = food.amount || 1;
  elements.foodUnit.value = food.unit || "serving";
  syncFoodUnitOptions();
  syncFoodPortionNote();
  elements.foodMeal.value = food.meal || defaultMealForNow();
  updateFoodAmountStep();
  elements.manualFoodCalories.value = Math.round(Number(food.calories || 0));
  elements.manualFoodProtein.value = roundNutritionValue(food.protein);
  elements.manualFoodCarbs.value = roundNutritionValue(food.carbs);
  elements.manualFoodFat.value = roundNutritionValue(food.fat);
  elements.manualFoodSubmit.textContent = "Save changes";
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = "Editing this food entry. Adjust serving, meal, or nutrition values, then save.";
  setFoodSearchActive(false);
  elements.foodSection.classList.add("is-editing", "is-detailing");
  syncFoodNutritionSummaryFromInputs();
  syncFoodNutritionMode();
  if (!phoneEditor) openEditLogForm(elements.foodSection, elements.foodAmount);
  syncFoodModeHeader();
  // Opening a mobile editor does not change diary data. Keep the real parent
  // rows, expanded capture and loaded thumbnail in place beneath its cover.
  if (phoneEditor) {
    elements.foodList.querySelectorAll('[data-food-entry-id]').forEach(card => {
      card.classList.toggle('is-selected', card.dataset.foodEntryId === food.id);
    });
  } else renderEntries();
  if (!isPhoneAddFoodLayout()) elements.foodAmount.focus();
}

function resetFoodForm() {
  // Keep every part of the diary editor, including its photo block, intact
  // while the opaque nested surface exits. Cleanup runs once it is unmounted.
  if (editingFoodId && addSurface.deferReset(elements.foodSection, resetFoodForm)) return;
  scanPhotoSession = null; scanEditingFoodId = null; scanDraftGeneration++;
  captureDraft.clear();plateContext.hidden=individualPhoto.hidden=true;plateContext.replaceChildren();
  scanRemovedFoodId = null;
  scanCorrectionController?.abort(); scanCorrectionController = null;
  elements.foodSection.classList.remove('is-photo-plate', 'is-scan-item');
  elements.manualFoodForm.append(elements.scanSimpleSaveActions);
  photoEditor.reset(); photoEditor.element.hidden = true; coverDisclosure.hidden = true; coverFoodKey = null;
  elements.foodEditSummary.after(photoEditor.element, coverDisclosure);
  addSurface.forgetParent('browse');
  addSurface.forgetParent('description');
  // Abort requests immediately, even while the inert closing presentation is
  // still visible. Only resetting its live fields waits for that short exit.
  cancelFoodSearch();
  aiDescriptionController?.abort();aiDescriptionController=null;aiDescriptionPending=false;
  if (addSurface.deferReset(elements.foodSection, resetFoodForm)) return;
  entryErrors(elements.manualFoodForm, {}, false);entryStatus(elements.manualFoodForm);
  addSurface.reset(elements.foodSection);
  elements.foodEditSummary.querySelector("span").textContent = "Food entry";
  foodSearchError = "";
  delete elements.manualFoodForm.dataset.foodDetail;
  syncFoodDetailBrand(null);
  mobileBrowseState = null;
  elements.closeFoodModal.setAttribute("aria-label", "Close food form");
  elements.manualFoodForm.reset();
  elements.manualFoodName.readOnly = false;
  elements.foodEditName.textContent = "Food";
  elements.foodEditSummary.querySelector("small").textContent = "Adjust serving, meal, or nutrition values.";
  elements.foodAmount.value = 1;
  elements.foodUnit.value = "serving";
  elements.foodMeal.value = defaultMealForNow();
  updateFoodAmountStep();
  elements.manualFoodSubmit.textContent = "Add food";
  elements.manualFoodSubmit.disabled = false;
  elements.scanSimpleSaveActions.hidden = true;
  elements.scanSaveMealStatus.textContent = "";
  editingFoodId = null;
  selectedFoodBase = null;
  foodNutritionOverridden = false;
  foodNutritionEditing = false;
  latestFoodSuggestions = [];
  foodSuggestionVisibleCount = 5;
  scannedFoodItems = [];
  scannedFoodAnalysis = null;
  aiDescriptionPending = false;
  elements.foodAiDescriptionInput.value = "";
  elements.foodAiDescriptionStatus.textContent = "";
  elements.foodAiDescriptionError.hidden = true;
  elements.foodAiDescription.hidden = true;
  elements.foodAiDescriptionTrigger.setAttribute("aria-expanded", "false");
  elements.foodAiDescriptionSubmit.textContent = "Estimate nutrition";
  elements.scanReview.hidden = true;
  elements.scanNoFood.hidden = true;
  elements.scanReviewHeadingActions.hidden = false;
  elements.scanFoodList.hidden = false;
  elements.scanReviewFooter.hidden = false;
  elements.openScanReview.hidden = true;
  elements.scanFoodList.replaceChildren();
  elements.foodSection.classList.remove("is-editing", "is-detailing", "is-reviewing-scan", "is-reviewing-text-estimate", "is-scan-empty", "is-manual-entry", "is-describing-ai", "has-food-suggestions");
  syncFoodNutritionMode();
  elements.manualFoodName.placeholder = "Search food";
  elements.foodNameLabel.textContent = "Food name (required)";
  elements.foodSuggestions.innerHTML = "";
  elements.foodPhotoStatus.textContent = "";
  elements.foodPhotoStatus.setAttribute("role", "status");
  document.body.classList.remove("food-scan-active");
  elements.searchNote.textContent = "Search saved foods, USDA, or Open Food Facts.";
  setFoodSearchActive(false);
  // Reset can run again after an immediate exit has restored its diary target.
  // Cleaning hidden form state must not blur that intentional return focus.
  clearEntryTransientState({ preserveFocus: true });
  syncFoodAiDescriptionState();
  syncFoodModeHeader();
}

function syncFoodModeHeader() {
  const isEditing = Boolean(editingFoodId);
  const isReviewingScan = elements.foodSection.classList.contains("is-reviewing-scan");
  const isTextEstimate = isReviewingScan && scannedFoodAnalysis?.inputMode === "text";
  elements.foodModeEyebrow.textContent = isEditing ? "Editing entry" : isTextEstimate ? "AI estimate" : isReviewingScan ? "Photo estimate" : "Add";
  elements.foodModeTitle.textContent = isEditing || scanEditingFoodId ? "Edit food" : isTextEstimate ? "Review estimate" : isReviewingScan ? "Review photo" : "Add";
  elements.foodMobileHeaderTitle.textContent = elements.foodModeTitle.textContent;
}

function syncExerciseModeHeader() {
  const isEditing = Boolean(editingExerciseId);
  elements.exerciseModeEyebrow.textContent = isEditing ? "Editing entry" : "Add";
  elements.exerciseModeTitle.textContent = isEditing ? "Edit exercise" : "Add";
  elements.exerciseMobileHeaderTitle.textContent = elements.exerciseModeTitle.textContent;
}

function setFoodSearchActive(isActive) {
  elements.foodSection.classList.toggle("is-searching", isActive);

}

function updateFoodAmountStep() {
  elements.foodAmount.step = "0.1";
}

function updateFoodAmountForUnit() {
  elements.foodAmount.value = elements.foodUnit.value === "g"
    ? Number(selectedFoodBase?.servingGrams || 1)
    : elements.foodUnit.value === "ml"
      ? Number(selectedFoodBase?.servingMl || 1)
      : 1;
  updateFoodAmountStep();
}

function syncFoodUnitOptions() {
  const gramsOption = elements.foodUnit.querySelector('option[value="g"]');
  const mlOption = elements.foodUnit.querySelector('option[value="ml"]');
  if (gramsOption) gramsOption.disabled = !(Number(selectedFoodBase?.servingGrams || 0) > 0);
  if (mlOption) mlOption.disabled = !(Number(selectedFoodBase?.servingMl || 0) > 0);
}

function syncFoodPortionNote() {
  if (!elements.foodPortionNote) return;
  const unit = elements.foodUnit.value;
  const grams = Number(selectedFoodBase?.servingGrams || 0);
  const ml = Number(selectedFoodBase?.servingMl || 0);
  const reference = unit === "ml" && ml > 0
    ? `${formatDecimal(ml)} ml`
    : grams > 0
      ? `${formatDecimal(grams)} g`
      : "";
  elements.foodPortionNote.textContent = reference
    ? `1 serving = ${reference}`
    : '';
  elements.foodPortionNote.hidden = !reference;
}

function hasSourceNutritionSummary() {
  return Boolean(selectedFoodBase)
    && !elements.foodSection.classList.contains("is-manual-entry")
    && !elements.foodSection.classList.contains("is-reviewing-scan");
}

function formatFoodNutritionValue(value, unit) {
  return `${formatDecimal(Number(value || 0))} ${unit}`;
}

function syncFoodNutritionSummary(values) {
  const headline=document.querySelector('#foodDetailCalories');if(headline)headline.textContent=formatFoodNutritionValue(values.calories,'kcal');
  elements.foodNutritionCalories.textContent = formatFoodNutritionValue(values.calories, "kcal");
  elements.foodNutritionProtein.textContent = formatFoodNutritionValue(values.protein, "g");
  elements.foodNutritionCarbs.textContent = formatFoodNutritionValue(values.carbs, "g");
  elements.foodNutritionFat.textContent = formatFoodNutritionValue(values.fat, "g");
}

function syncFoodDetailBrand(food) {
  const brand = document.querySelector("#foodEditBrand");
  brand.textContent = foodBrandLabel(food);
  brand.hidden = !brand.textContent;
}

function syncFoodSubmitLabel() {
  if (scannedFoodItems.length || elements.manualFoodForm.dataset.foodDetail === "scan") return;
  elements.manualFoodSubmit.textContent = elements.foodSection.classList.contains("is-detailing")
    ? foodActionLabel(elements.foodMeal.value, Boolean(editingFoodId)) : "Add food";
}

// Reparent the existing inputs only for the diary editor. Their values,
// listeners and validation nodes stay intact; other Add flows keep their DOM.
function syncNutritionEditorLayout(fields) {
  const edit = Boolean(editingFoodId), editor = elements.foodNutritionEditor;
  const grid = editor.querySelector('.nutrition-editor-fields');
  if (edit && fields[0].parentElement !== grid) {
    fields.forEach(field => {
      const input = field.querySelector('input'), unit = input === elements.manualFoodCalories ? 'kcal' : 'g';
      const label = field.querySelector('span');
      label.dataset.nutritionLabel = label.textContent;
      label.textContent = label.textContent.replace(/ \((kcal|g)\)$/, '');
      const value = document.createElement('span');value.className = 'nutrition-input-value';
      const suffix = document.createElement('span');suffix.className = 'nutrition-input-unit';
      suffix.id = input.id + 'Unit';suffix.textContent = unit;
      input.before(value);value.append(input, suffix);
      input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'),suffix.id,'foodNutritionBasis'].filter(Boolean).join(' '));
      grid.append(field);
    });
  } else if (!edit && fields[0].parentElement === grid) {
    fields.forEach(field => {
      const input = field.querySelector('input'), label = field.querySelector('span');
      label.textContent = label.dataset.nutritionLabel;delete label.dataset.nutritionLabel;
      const ids = (input.getAttribute('aria-describedby') || '').split(' ').filter(id=>id && id!==input.id+'Unit' && id!=='foodNutritionBasis');
      if(ids.length)input.setAttribute('aria-describedby',ids.join(' '));else input.removeAttribute('aria-describedby');
      field.querySelector('.nutrition-input-value').replaceWith(input);
    });
    elements.foodNutritionSummary.after(...fields);
  }
  elements.editFoodNutrition.querySelector('.nutrition-section-title').hidden = !edit;
  elements.editFoodNutrition.setAttribute('aria-controls', edit ? editor.id : fields.map(field=>field.querySelector('input').id).join(' '));
}

function syncFoodNutritionMode() {
  const showSummary = hasSourceNutritionSummary();
  const isFoodDetail = elements.foodSection.classList.contains("is-detailing") || Boolean(editingFoodId);
  const nutritionFields = [
    elements.manualFoodCalories,
    elements.manualFoodProtein,
    elements.manualFoodCarbs,
    elements.manualFoodFat,
  ].map((input) => input.closest(".food-form-field"));
  syncNutritionEditorLayout(nutritionFields);

  elements.foodFilterBar.hidden = isFoodDetail;
  elements.foodNutritionSummary.hidden = !showSummary;
  elements.foodNutritionGrid.hidden = showSummary && foodNutritionEditing;
  elements.foodNutritionEditor.hidden = !editingFoodId || !showSummary || !foodNutritionEditing;
  elements.foodSection.classList.toggle("is-nutrition-editing", showSummary && foodNutritionEditing);

  elements.foodNutritionAction.textContent = editingFoodId ? (foodNutritionEditing ? "Hide details" : "Edit") : (foodNutritionEditing ? "Done" : "Edit nutrition");
  elements.editFoodNutrition.setAttribute('aria-label', editingFoodId ? (foodNutritionEditing ? 'Hide nutrition details' : 'Edit nutrition') : elements.foodNutritionAction.textContent);
  elements.editFoodNutrition.setAttribute("aria-expanded", String(foodNutritionEditing));
  nutritionFields.forEach((field) => {
    const isHidden = showSummary && !foodNutritionEditing;
    field.hidden = isHidden;

  });

}

function syncFoodNutritionSummaryFromInputs() {
  syncFoodNutritionSummary({
    calories: decimalValue(elements.manualFoodCalories.value,true),
    protein: decimalValue(elements.manualFoodProtein.value,true),
    carbs: decimalValue(elements.manualFoodCarbs.value,true),
    fat: decimalValue(elements.manualFoodFat.value,true),
  });
}

function currentFoodAmount() {
  const parsed = portionMath.parseDecimalAmount(elements.foodAmount.value);
  return parsed.state === "valid" ? parsed.value : null;
}

function updateNutritionForPortion() {
  if (!selectedFoodBase) return;

  const amount = currentFoodAmount();
  if (amount === null || portionMath.amountError(amount)) return;
  const multiplier = portionMultiplier(selectedFoodBase, amount, elements.foodUnit.value);
  const values = {
    calories: scaleCalories(selectedFoodBase.calories, multiplier),
    protein: scaleMacro(selectedFoodBase.protein, multiplier),
    carbs: scaleMacro(selectedFoodBase.carbs, multiplier),
    fat: scaleMacro(selectedFoodBase.fat, multiplier),
  };

  elements.manualFoodCalories.value = values.calories;
  elements.manualFoodProtein.value = values.protein;
  elements.manualFoodCarbs.value = values.carbs;
  elements.manualFoodFat.value = values.fat;
  syncFoodNutritionSummary(values);
}

function parseServing(serving = "") {
  const normalized = serving.toLowerCase().replace(",", ".");
  const amountMatch = normalized.match(/(\d+(?:\.\d+)?)/);
  const amount = amountMatch ? Number(amountMatch[1]) : 1;

  if (/(?:^|[^a-z])(?:g|gr|grm|gram|grams)\b/.test(normalized)) return { amount, unit: "g", grams: amount };
  if (/(?:^|[^a-z])(?:ml|milliliter|milliliters|millilitre|millilitres)\b/.test(normalized)) return { amount, unit: "ml", grams: null };
  if (amountMatch && !/[a-z]/i.test(normalized.replace(amountMatch[0], ""))) return { amount, unit: "g", grams: amount };
  if (/slice|piece|egg|medium/.test(normalized)) return { amount, unit: "piece", grams: null };
  return { amount, unit: "serving", grams: null };
}

function portionMultiplier(food, amount, unit) {
  return portionMath.portionMultiplier({
    amount,
    unit,
    servingGrams: food.servingGrams,
    servingMl: food.servingMl,
  });
}

function scaleMacro(value, multiplier) {
  return roundNutritionValue(Number(value || 0) * multiplier);
}

function scaleCalories(value, multiplier) {
  return Math.round(Number(value || 0) * multiplier);
}

function roundNutritionValue(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function cancelFoodSearch() {
  clearTimeout(autocompleteTimer);
  suggestionAbortController?.abort();
  suggestionAbortController = null;
  foodSearchRequestId++;
  foodSearchPending = false;
  elements.foodSuggestions.removeAttribute("aria-busy");
}

function renderFoodSearchError(message) {
  foodSearchError = message;
  elements.foodSuggestions.querySelector(".food-search-error")?.remove();
  elements.foodSuggestions.querySelector(".food-search-fallbacks")?.remove();
  const error = document.createElement("div");
  error.className = "food-search-error";
  error.setAttribute("role", "alert");
  error.innerHTML = '<strong>Online search unavailable</strong><p></p><div><button type="button" data-search-retry>Try again</button><button type="button" data-search-manual>Add manually</button></div>';
  error.querySelector("p").textContent = message;
  error.querySelector("[data-search-retry]").addEventListener("click", () => searchFoodSuggestions(elements.manualFoodName.value));
  error.querySelector("[data-search-manual]").addEventListener("click", () => {
    fillManualFood({ name: elements.manualFoodName.value.trim(), source: "Manual", serving: "1 serving", calories: 0, protein: 0, carbs: 0, fat: 0 });
  });
  elements.foodSuggestions.appendChild(error);
  elements.searchNote.textContent = latestFoodSuggestions.filter(foodMatchesActiveFilter).length
    ? "Your saved and recent matches are still available." : "Your search is still here.";
  setFoodSearchActive(true);
}

async function searchFoodSuggestions(query) {
  cancelFoodSearch();
  const requestId = foodSearchRequestId;
  foodSearchError = "";
  elements.foodSection.classList.remove("has-search-fallback");
  const localMatches = searchFoodLibrary(query);

  if (!query.trim()) {
    showBrowseFoodSuggestions();
    return;
  }

  if (query.trim().length < 2) {
    elements.foodSuggestions.innerHTML = "";
    elements.foodSection.classList.remove("has-food-suggestions");
    elements.searchNote.textContent = "Keep typing to search foods.";
    setFoodSearchActive(true);
    return;
  }

  if (localMatches.length) {
    renderSuggestions(localMatches);
    elements.searchNote.textContent = "Showing saved and recent foods while searching online sources...";
  } else {
    latestFoodSuggestions = [];
    elements.searchNote.textContent = "Searching USDA and Open Food Facts...";
    setFoodSearchActive(true);
  }

  setFoodSearchActive(true);
  if (!localMatches.length) {
    elements.foodSuggestions.innerHTML = '<p class="food-search-status" role="status">Searching food sources...</p>';
  }
  const controller = new AbortController();
  suggestionAbortController = controller;
  foodSearchPending = true;
  elements.foodSuggestions.setAttribute("aria-busy", "true");
  const isCurrent = () => requestId === foodSearchRequestId && !controller.signal.aborted
    && elements.manualFoodName.value === query && !elements.foodSection.classList.contains("is-detailing");
  try {
    const response = await fetch(`/api/foods/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
    const data = await response.json();
    if (!isCurrent()) return;
    if (!response.ok) throw new Error(data.error || "Food sources are temporarily unavailable.");
    const onlineFoods = Array.isArray(data.foods) ? data.foods : [];
    renderSuggestions(rankFoodSuggestions(dedupeFoodSuggestions([...localMatches, ...onlineFoods]), query).slice(0, 24));
  } catch (error) {
    if (!isCurrent() || error.name === "AbortError") return;
    renderSuggestions(localMatches);
    renderFoodSearchError(foodSearchErrorMessage(error));
  } finally {
    if (requestId === foodSearchRequestId) {
      foodSearchPending = false;
      suggestionAbortController = null;
      elements.foodSuggestions.removeAttribute("aria-busy");
    }
  }
}

function showSimpleScannedPlate(analysis = null, imageDataUrl = "", options = {}) {
  const foods = Array.isArray(analysis?.foods) ? analysis.foods : [];
  const inputMode = options.inputMode || scannedFoodAnalysis?.inputMode || "photo";
  if (inputMode === 'photo') {
    if (analysis) {
      scannedFoodItems = foods.map(food => createScannedFoodItem(food, { inputMode }));
      scannedFoodAnalysis = { ...analysis, imageDataUrl, inputMode };
    }
    elements.manualFoodForm.dataset.foodDetail = 'scan';
    elements.foodSection.classList.add('is-photo-plate');
    showScannedFoodsReview();
    return;
  }
  if (inputMode === "photo") {
    elements.manualFoodForm.dataset.foodDetail = "scan";
    elements.foodEditSummary.querySelector("span").textContent = "Food photo · AI estimate";
    elements.foodEditSummary.querySelector("small").textContent = "Estimated portions and nutrition. Review before adding.";
    syncFoodDetailBrand(null);
  }
  if (analysis && !foods.length) {
    if (inputMode === "text") throw new Error("No food could be estimated from this description.");
    showNoFoodDetected(analysis, imageDataUrl);
    return;
  }
  if (!scannedFoodItems.length && !foods.length) return;

  if (foods.length) {
    scannedFoodItems = foods.map((food) => createScannedFoodItem(food, { inputMode }));
    scannedFoodAnalysis = {
      confidence: analysis.confidence || "low",
      notes: String(analysis.notes || "").trim(),
      imageDataUrl,
      inputMode,
      description: inputMode === "text" ? String(options.description || "").trim() : "",
    };
  }

  const includedFoods = scannedFoodItems.filter((food) => food.included);
  // Text estimates start without a photo; no prior scanner draft leaks into them.
  if (analysis && inputMode === 'text') photoEditor.reset();
  elements.foodEditSummary.after(photoEditor.element, coverDisclosure);
  photoEditor.element.hidden = false; coverDisclosure.hidden = true;
  const total = (key) => Math.round(includedFoods.reduce((sum, food) => sum + Number(food[key] || 0), 0) * 10) / 10;
  const plateName = includedFoods.length === 1
    ? includedFoods[0].name
    : includedFoods.length > 1
      ? includedFoods.length <= 3
        ? includedFoods.map((food) => food.name).join(", ")
        : `Scanned plate (${includedFoods.length} foods)`
      : "Scanned plate";
  const servingGrams = includedFoods.reduce((sum, food) => sum + Number(food.servingGrams || 0), 0);
  const simplePortion = IntakeScannedFood.simplePlatePortion(includedFoods);
  const singleFood = includedFoods.length === 1 ? includedFoods[0] : null;
  const baseNutrition = (key) => singleFood
    ? Number(singleFood.baseNutrition?.[key] ?? singleFood[key] ?? 0)
    : total(key);

  selectedFoodBase = {
    name: plateName,
    source: inputMode === "text" ? "AI ESTIMATE" : "OpenAI photo estimate",
    serving: "1 serving",
    servingGrams: singleFood && !["g", "ml"].includes(simplePortion.unit)
      ? servingGrams / simplePortion.amount || 100
      : servingGrams || 100,
    calories: baseNutrition("calories"),
    protein: baseNutrition("protein"),
    carbs: baseNutrition("carbs"),
    fat: baseNutrition("fat"),
    scanInitialMultiplier: simplePortion.initialMultiplier,
  };

  editingFoodId = null;
  foodNutritionOverridden = false;
  elements.foodSection.classList.remove("is-editing");
  elements.foodSection.classList.remove("is-reviewing-scan");
  elements.foodSection.classList.remove("is-reviewing-text-estimate");
  elements.foodSection.classList.remove("is-scan-empty");
  elements.foodSection.classList.add("is-detailing");
  elements.scanReview.hidden = true;
  elements.openScanReview.hidden = scannedFoodItems.length === 0;
  elements.openScanReview.textContent = inputMode === "text"
    ? `Review estimate${scannedFoodItems.length > 1 ? ` · ${scannedFoodItems.length} items` : ""}`
    : scannedFoodItems.length === 1
      ? "Review estimate"
      : `Review your plate · ${scannedFoodItems.length} items`;
  elements.manualFoodSubmit.textContent = includedFoods.length === 1
    ? "+ Add 1 food"
    : `+ Add ${includedFoods.length} foods`;
  elements.manualFoodSubmit.disabled = includedFoods.length === 0;
  elements.scanSimpleSaveActions.hidden = includedFoods.length === 0;
  elements.scanSaveAsMeal.disabled = includedFoods.length === 0;
  const plateDisplayName = includedFoods.length > 0 && includedFoods.length <= 3
    ? includedFoods.map(food => formatFoodDisplayName(food)).join(', ') : plateName;
  elements.manualFoodName.value = plateDisplayName;
  elements.manualFoodName.readOnly = true;
  elements.foodEditName.textContent = plateDisplayName;
  elements.foodAmount.value = simplePortion.amount;
  elements.foodUnit.value = simplePortion.unit;
  if (!elements.foodMeal.value) elements.foodMeal.value = defaultMealForNow();
  updateFoodAmountStep();
  updateNutritionForPortion(true);
  syncFoodNutritionMode();
  elements.foodSuggestions.innerHTML = "";
  elements.searchNote.textContent = scannedFoodAnalysis?.notes || (inputMode === "text"
    ? "Review the estimated foods and portions before adding them."
    : "The detected foods will be added separately. Review the plate only if something needs changing.");
  elements.foodPhotoStatus.textContent = `${scannedFoodItems.length} ${scannedFoodItems.length === 1 ? "food" : "foods"} ${inputMode === "text" ? "estimated" : "detected"} · ${scannedFoodAnalysis?.confidence || "low"} confidence.`;
  setFoodSearchActive(false);
  syncFoodModeHeader();

}

function showNoFoodDetected(analysis = null, imageDataUrl = "") {
  scannedFoodItems = [];
  scannedFoodAnalysis = {
    outcome: "no_food",
    containsFood: false,
    foods: [],
    confidence: analysis?.confidence || "low",
    notes: String(analysis?.notes || "").trim(),
    imageDataUrl,
    inputMode: "photo",
  };
  selectedFoodBase = null;
  elements.foodSection.classList.remove("is-editing", "is-reviewing-text-estimate");
  elements.foodSection.classList.add("is-detailing", "is-reviewing-scan", "is-scan-empty");
  elements.scanReview.hidden = false;
  elements.scanNoFood.hidden = false;
  elements.scanReviewHeadingActions.hidden = true;
  elements.scanFoodList.hidden = true;
  elements.scanReviewFooter.hidden = true;
  elements.scanSimpleSaveActions.hidden = true;
  elements.openScanReview.hidden = true;
  elements.scanReviewEyebrow.textContent = "Photo scan";
  elements.scanReviewTitle.textContent = "No food found";
  elements.scanReviewDescription.textContent = "We couldn't detect any food in this photo.";
  elements.foodPhotoStatus.setAttribute("role", "status");
  elements.foodPhotoStatus.textContent = "No food detected. Try another photo or add food manually.";
  syncFoodModeHeader();

  requestAnimationFrame(() => {
    elements.scanReviewTitle.setAttribute("tabindex", "-1");
    elements.scanReviewTitle.focus();
  });
}

function leaveNoFoodResult() {
  if (!elements.foodSection.classList.contains("is-scan-empty")) return;
  elements.foodSection.classList.remove("is-reviewing-scan", "is-scan-empty");
  elements.scanReview.hidden = true;
  elements.scanNoFood.hidden = true;
  scannedFoodAnalysis = null;
  syncFoodModeHeader();

}

function selectedLogHeading() {
  const today = localDateKey(new Date());
  const yesterday = previousDayKey(today);
  if (state.selectedDate === today) return "Today's log";
  if (state.selectedDate === yesterday) return "Yesterday's log";
  return `${dateFromKey(state.selectedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })} log`;
}

function showScannedFoodsReview() {
  const photoPlate = scannedFoodAnalysis?.inputMode === 'photo';
  if (!scannedFoodItems.length && !photoPlate) return;
  photoEditor.element.hidden = false; coverDisclosure.hidden = true; elements.scanFoodList.before(photoEditor.element);
  const isTextEstimate = scannedFoodAnalysis?.inputMode === "text";
  elements.foodSection.classList.add("is-detailing", "is-reviewing-scan");
  elements.foodSection.classList.toggle("is-reviewing-text-estimate", isTextEstimate);
  elements.scanReview.hidden = false;
  elements.scanNoFood.hidden = true;
  elements.scanReviewHeadingActions.hidden = false;
  elements.scanFoodList.hidden = false;
  elements.scanReviewFooter.hidden = false;
  elements.foodSection.classList.remove("is-scan-empty");
  elements.scanSimpleSaveActions.hidden = true;
  elements.scanReviewMeal.value = elements.foodMeal.value || defaultMealForNow();
  elements.scanReviewEyebrow.textContent = isTextEstimate ? "AI estimated foods" : "Food photo · AI estimate";
  elements.scanReviewTitle.textContent = isTextEstimate ? "Review your estimate" : "Review your plate";
  elements.scanReviewDescription.textContent = isTextEstimate
    ? "Check the estimated foods and portions before adding them."
    : "Check each estimated food and portion before adding. You can exclude anything that doesn't belong.";
  elements.closeScanReview.textContent = 'Edit description';
  elements.closeScanReview.dataset.shortLabel = 'Edit description';
  elements.closeScanReview.hidden = !isTextEstimate;
  if (photoPlate) {
    elements.foodSection.classList.add('is-photo-plate');
    elements.scanReviewFooter.querySelector('.scan-review-footer-actions').before(elements.scanSimpleSaveActions);
    elements.closeFoodModal.setAttribute('aria-label', scanEditingFoodId ? 'Back to plate summary' : 'Back to food photo');
    elements.openScanReview.hidden = true;
  }
  selectedFoodBase = null;
  syncFoodModeHeader();

  renderScanReview();
  if (!isTextEstimate) {
    elements.foodSection.scrollTop = 0;

    elements.scanReviewTitle.setAttribute("tabindex", "-1");
    elements.scanReviewTitle.focus({ preventScroll: true });
  }
}

function createScannedFoodItem(food, { inputMode = "photo" } = {}) {
  const normalized = IntakeScannedFood.normalizeScannedFoodEstimate(food, inputMode);
  // Text estimates should expose the structured resolver's interpretation in
  // review. Keep photo naming untouched because its label describes what was
  // visually detected, while resolvedFoodName is source metadata there.
  const reviewName = inputMode === "text"
    ? String(food.resolvedFoodName || food.name || "Unknown food").trim()
    : String(food.name || "Unknown food").trim();

  return {
    id: localRecordId(),
    included: true,
    name: reviewName || "Unknown food",
    amount: normalized.amount,
    unit: normalized.unit,
    servingGrams: normalized.servingGrams,
    servingMl: normalized.servingMl,
    confidence: food.confidence || "low",
    notes: String(food.notes || "").trim(),
    source: food.source || "OpenAI photo estimate",
    sourceId: String(food.sourceId || ""),
    nutritionSource: String(food.nutritionSource || ""),
    resolvedFoodName: String(food.resolvedFoodName || food.name || "").trim(),
    correctionOpen: false,
    correctionText: "",
    correctionStatus: "",
    isCorrecting: false,
    detailsOpen: false,
    calories: normalized.calories,
    protein: normalized.protein,
    carbs: normalized.carbs,
    fat: normalized.fat,
    baseNutrition: normalized.baseNutrition,
  };
}

function renderScanReview() {
  elements.scanReviewFooter.querySelector('.add-entry-status')?.remove();
  if (elements.scanSaveMealStatus) elements.scanSaveMealStatus.textContent = "";
  elements.scanFoodList.replaceChildren();
  const photoPlate = scannedFoodAnalysis?.inputMode === 'photo';
  if (photoPlate) {
    syncPhotoPlate();
    if (!scanEditingFoodId) {
      for (const food of selectedScannedFoods()) {
        const row = document.createElement('button'); row.type = 'button'; row.className = 'scan-plate-row';
        row.dataset.scanFoodId = food.id; row.dataset.scanAction = 'edit';
        const copy = document.createElement('span'), name = document.createElement('strong'), portion = document.createElement('small');
        name.textContent = formatFoodDisplayName(food); portion.textContent = formatScannedFoodPortion(food); copy.append(name, portion);
        const kcal = document.createElement('span'); kcal.className = 'scan-plate-kcal'; kcal.textContent = `${Math.round(food.calories)} kcal`;
        const arrow = document.createElement('span'); arrow.className = 'scan-plate-arrow'; arrow.textContent = '›'; arrow.setAttribute('aria-hidden', 'true');
        row.setAttribute('aria-label', `Edit ${formatFoodDisplayName(food)}, ${portion.textContent}, ${kcal.textContent}`);
        row.append(copy, kcal, arrow); elements.scanFoodList.append(row);
      }
      updateScanReviewTotals(); return;
    }
  }
  scannedFoodItems.forEach((food, index) => {
    if (photoPlate && food.id !== scanEditingFoodId) return;
    const card = document.createElement("article");
    card.className = `scan-food-card${food.included ? "" : " is-excluded"}`;
    card.dataset.scanFoodId = food.id;

    const top = document.createElement("div");
    top.className = "scan-food-card-top";
    const number = document.createElement("span");
    number.className = "scan-food-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const summary = document.createElement("div");
    summary.className = "scan-food-summary";
    const name = document.createElement("strong");
    name.textContent = formatFoodDisplayName(food);
    const meta = document.createElement("span");
    meta.textContent = `${formatScannedFoodPortion(food)} · ${Math.round(Number(food.calories || 0))} kcal`;
    summary.append(name, meta);
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "scan-food-remove";
    removeButton.dataset.scanAction = "toggle";
    removeButton.textContent = food.included ? "Remove" : "Restore";
    removeButton.setAttribute("aria-pressed", String(!food.included));
    const actions = document.createElement("div");
    actions.className = "scan-food-card-actions";
    const correctButton = document.createElement("button");
    correctButton.type = "button";
    correctButton.className = "scan-food-correct";
    correctButton.dataset.scanAction = "correct";
    correctButton.textContent = food.correctionOpen ? "Cancel change" : "Change food";
    correctButton.setAttribute("aria-expanded", String(food.correctionOpen));
    if (food.included) actions.append(correctButton);
    actions.append(removeButton);
    top.append(number, summary, actions);
    const amountAdjuster = food.included && !photoPlate ? createScanAmountAdjuster(food) : null;

    let correction = null;
    if (food.correctionOpen) {
      correction = document.createElement("div");
      correction.className = "scan-food-correction";
      correction.id = `scan-correction-${food.id}`;
      correctButton.setAttribute('aria-controls',correction.id);
      const correctionLabel = document.createElement("label");
      const correctionCaption = document.createElement("span");
      correctionCaption.textContent = "What is it instead?";
      const correctionInput = document.createElement("input");
      correctionInput.type = "text";
      correctionInput.maxLength = 240;
      correctionInput.placeholder = "e.g. mashed potatoes, not rice";
      correctionInput.value = food.correctionText;
      correctionInput.dataset.scanCorrectionInput = "";
      correctionInput.disabled = food.isCorrecting;
      correctionLabel.append(correctionCaption, correctionInput);
      const correctionSubmit = document.createElement("button");
      correctionSubmit.type = "button";
      correctionSubmit.dataset.scanAction = "apply-correction";
      correctionSubmit.disabled = food.isCorrecting || food.correctionText.trim().length < 2;
      correctionSubmit.textContent = food.isCorrecting ? "Checking…" : "Update estimate";
      correction.append(correctionLabel, correctionSubmit);
      if (food.correctionStatus) {
        const correctionStatus = document.createElement("p");
        correctionStatus.className = "scan-food-correction-status";
        correctionStatus.textContent = food.correctionStatus;
        correction.append(correctionStatus);
      }
    }

    const fields = document.createElement("div");
    fields.className = "scan-food-fields";
    fields.id = `scan-nutrition-${food.id}`;
    const portionFields = document.createElement('div'); portionFields.className = 'scan-food-fields scan-item-portion';
    portionFields.append(createScanField('Amount', 'amount', food.amount, 'decimal'), createScanUnitField(food));
    if (!photoPlate) fields.append(...portionFields.children);
    fields.append(
      createScanField("Calories", "calories", food.calories, "number"),
      createScanField("Protein", "protein", food.protein, "number", "g"),
      createScanField("Carbs", "carbs", food.carbs, "number", "g"),
      createScanField("Fat", "fat", food.fat, "number", "g"),
    );
    const nutritionBasis = document.createElement("p");
    nutritionBasis.className = "scan-food-nutrition-basis";
    nutritionBasis.textContent = "Nutrition totals for this amount.";

    const detailsButton = document.createElement("button");
    detailsButton.type = "button";
    detailsButton.className = "scan-food-details-toggle";
    detailsButton.dataset.scanAction = "details";
    detailsButton.setAttribute("aria-expanded", String(food.detailsOpen));
    if (food.detailsOpen) detailsButton.setAttribute('aria-controls',fields.id);
    detailsButton.textContent = photoPlate ? (food.detailsOpen ? 'Hide nutrition' : 'Edit nutrition') : food.detailsOpen ? "Hide portion & nutrition" : "Edit portion & nutrition";

    card.append(top);
    if (photoPlate && !food.correctionOpen) card.append(portionFields);
    if (amountAdjuster) card.append(amountAdjuster);
    if (correction) card.append(correction);
    if (food.included) card.append(detailsButton);
    if (food.detailsOpen && food.notes) {
      const notes = document.createElement("p");
      notes.className = "scan-food-notes";
      notes.textContent = food.notes;
      card.append(fields, nutritionBasis, notes);
    } else if (food.detailsOpen) {
      card.append(fields, nutritionBasis);
    }
    elements.scanFoodList.append(card);
  });
  updateScanReviewTotals();
}

function syncPhotoPlate() {
  const selected = selectedScannedFoods(), food = scannedFoodItems.find(item => item.id === scanEditingFoodId);
  const editing = Boolean(food), empty = !selected.length;
  elements.foodSection.classList.toggle('is-scan-item', editing);
  elements.foodSection.classList.toggle('is-scan-empty', empty);
  elements.scanReviewEyebrow.textContent = 'AI estimate';
  elements.scanReviewTitle.textContent = editing ? formatFoodDisplayName(food) : empty ? 'No foods detected' : `${selected.length} ${selected.length === 1 ? 'food' : 'foods'} detected`;
  elements.scanReviewDescription.textContent = editing ? 'Adjust this food. Changes stay in your plate until you add it.' : empty ? 'Try another photo or add food manually.' : 'Review the foods and portions before adding.';
  elements.scanReviewHeadingActions.hidden = editing || empty;
  elements.scanFoodList.hidden = empty;
  elements.scanNoFood.hidden = !empty;
  elements.scanReviewFooter.hidden = editing || empty;
  elements.scanSimpleSaveActions.hidden = editing || empty;
  photoEditor.element.hidden = editing;
  elements.foodNutritionSummary.hidden = true;
  const undo = document.querySelector('#scanRemoveUndo');
  undo.hidden = editing || !scannedFoodItems.some(item => item.id === scanRemovedFoodId && !item.included);
  elements.closeFoodModal.setAttribute('aria-label', editing ? 'Back to plate summary' : 'Back to food photo');
  syncFoodModeHeader();
}

function photoPlateBack() {
  if (scannedFoodAnalysis?.inputMode !== 'photo' || !elements.foodSection.classList.contains('is-photo-plate')) return false;
  if (entryCommits.has('food')) return true;
  if (scanEditingFoodId) {
    const id = scanEditingFoodId, food = scannedFoodItems.find(item => item.id === id);
    // Back out of replacement is cancellation, not a silent name mutation.
    if (food?.correctionOpen) {
      scanCorrectionController?.abort(); scanCorrectionController = null; scanDraftGeneration++;
      food.correctionOpen = false; food.isCorrecting = false; food.correctionText = ''; food.correctionStatus = '';
      renderScanReview(); return true;
    }
    if (!validateScannedFoodAmounts(food ? [food] : [])) return true;
    scanEditingFoodId = null; renderScanReview();
    const content = elements.foodSection.querySelector('.add-flow-content'); if (content) content.scrollTop = plateSummaryScroll;
    animateFoodStep(content, 'back', window);
    elements.scanFoodList.querySelector(`[data-scan-food-id="${id}"]`)?.focus({ preventScroll: true });
  } else {
    const session = scanPhotoSession;
    resetFoodForm();
    scanner.open('food', { photoSession: session });
  }
  return true;
}

function formatScannedFoodPortion(food) {
  const amount = Math.round(Number(food.amount || 0) * 10) / 10;
  if (["g", "ml"].includes(food.unit)) return `${amount} ${food.unit}`;
  const unit = food.unit === "piece"
    ? amount === 1 ? "piece" : "pieces"
    : amount === 1 ? "serving" : "servings";
  return `${amount} ${unit}`;
}

function createScanAmountAdjuster(food) {
  const adjustment = food.unit === "g" ? 25 : food.unit === "ml" ? 50 : 0.5;
  const amountLabel = formatScannedFoodPortion(food);
  const control = document.createElement("div");
  control.className = "scan-amount-adjuster";
  control.setAttribute("aria-label", "Quick portion controls");
  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.className = "scan-amount-step";
  decrease.dataset.scanAction = "adjust-amount";
  decrease.dataset.scanAdjustment = "-1";
  decrease.textContent = "−";
  decrease.disabled = Number(food.amount || 0) <= 0;
  decrease.setAttribute("aria-label", `Decrease amount by ${adjustment} ${food.unit}`);
  const value = document.createElement("output");
  value.textContent = amountLabel;
  value.setAttribute("aria-label", `Amount: ${amountLabel}`);
  const increase = document.createElement("button");
  increase.type = "button";
  increase.className = "scan-amount-step";
  increase.dataset.scanAction = "adjust-amount";
  increase.dataset.scanAdjustment = "1";
  increase.textContent = "+";
  increase.setAttribute("aria-label", `Increase amount by ${adjustment} ${food.unit}`);
  control.append(decrease, value, increase);
  return control;
}

function createScanField(label, field, value, type, suffix = "") {
  const wrapper = document.createElement("label");
  wrapper.className = `scan-item-field scan-item-${field}`;
  const caption = document.createElement("span");
  caption.textContent = label;
  const inputWrap = document.createElement("span");
  inputWrap.className = "scan-item-input";
  const input = document.createElement("input");
  // iOS offers a locale-aware decimal keypad. A native number input rejects
  // its comma in locales such as Slovenian, so Amount uses text input while
  // retaining the decimal keypad and is normalized before calculations.
  input.type = type === "decimal" ? "text" : type;
  input.value = value;
  input.dataset.scanField = field;
  input.disabled = false;
  if (type === "number" || type === "decimal") {
    input.min = "0";
    input.inputMode = "decimal";
  }
  if (type === "number") input.step = "0.1";
  if (type === "decimal") {
    input.pattern = "[0-9]*[.,]?[0-9]*";
    input.spellcheck = false;
  }
  inputWrap.append(input);
  if (suffix) {
    const unit = document.createElement("small");
    unit.textContent = suffix;
    inputWrap.append(unit);
  }
  wrapper.append(caption, inputWrap);
  return wrapper;
}

function createScanUnitField(food) {
  const wrapper = document.createElement("label");
  wrapper.className = "scan-item-field scan-item-unit";
  const caption = document.createElement("span");
  caption.textContent = "Unit";
  const select = document.createElement("select");
  select.dataset.scanField = "unit";
  [["serving", "serving"], ["piece", "piece"], ["g", "g"], ["ml", "ml"]].forEach(([optionValue, label]) => {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    option.selected = optionValue === food.unit;
    if (optionValue === "g") option.disabled = !(Number(food.servingGrams || 0) > 0);
    if (optionValue === "ml") option.disabled = !(Number(food.servingMl || 0) > 0);
    select.append(option);
  });
  wrapper.append(caption, select);
  return wrapper;
}

function scannedFoodMultiplier(food) {
  if (food.unit === "g") return food.amount / (food.servingGrams || 100);
  if (food.unit === "ml") return food.servingMl ? food.amount / food.servingMl : 0;
  return food.amount;
}

function updateScanFoodPortion(food) {
  const multiplier = scannedFoodMultiplier(food);
  ["calories", "protein", "carbs", "fat"].forEach((key) => {
    food[key] = Math.round(Number(food.baseNutrition[key] || 0) * multiplier * 10) / 10;
  });
}

function updateScanReviewTotals() {
  const selected = scannedFoodItems.filter((food) => food.included);
  const total = (key) => Math.round(selected.reduce((sum, food) => sum + Number(food[key] || 0), 0) * 10) / 10;
  const totals = {
    calories: total("calories"),
    protein: total("protein"),
    carbs: total("carbs"),
    fat: total("fat"),
  };
  elements.scanSelectedCount.textContent = `${selected.length} ${selected.length === 1 ? "food" : "foods"}`;
  elements.scanTotalCalories.textContent = totals.calories;
  elements.scanTotalProtein.textContent = totals.protein;
  elements.scanTotalCarbs.textContent = totals.carbs;
  elements.scanTotalFat.textContent = totals.fat;
  syncFoodNutritionSummary(totals);
  if (elements.foodSection.classList.contains("is-reviewing-scan")) {
    foodNutritionEditing = false;
    elements.foodSection.classList.remove("is-nutrition-editing");

    elements.foodNutritionSummary.hidden = scannedFoodAnalysis?.inputMode === 'photo';
    elements.foodNutritionGrid.hidden = false;
  }
  elements.scanAddSelectedFoods.disabled = selected.length === 0;
  elements.scanSaveAsMeal.disabled = selected.length === 0;
  elements.scanAddSelectedFoods.textContent = selected.length === 1 ? "Add food" : `Add ${selected.length} foods`;
  if (scannedFoodAnalysis?.inputMode === 'photo') elements.scanAddSelectedFoods.textContent = `Add ${selected.length} ${selected.length === 1 ? 'food' : 'foods'}`;
}

function syncScanCardNutrition(card, food) {
  ["calories", "protein", "carbs", "fat"].forEach((key) => {
    const input = card.querySelector(`[data-scan-field="${key}"]`);
    if (input) input.value = food[key];
  });
}

async function correctScannedFood(foodId) {
  const food = scannedFoodItems.find((item) => item.id === foodId);
  const correction = food?.correctionText.trim();
  if (!food || correction.length < 2 || food.isCorrecting) return;

  const isTextEstimate = scannedFoodAnalysis?.inputMode === "text";
  if (!isTextEstimate && !scannedFoodAnalysis?.imageDataUrl) {
    food.correctionStatus = "The original photo is no longer available. Scan the plate again.";
    renderScanReview();
    return;
  }

  food.isCorrecting = true;
  food.correctionStatus = "";
  renderScanReview();
  const generation = scanDraftGeneration;
  const controller = !isTextEstimate ? new AbortController() : null;
  if (controller) { scanCorrectionController?.abort(); scanCorrectionController = controller; }
  // Text estimates may edit different cards concurrently. Only the photo
  // child editor has a single draft-generation owner; resets still invalidate
  // both flows through the retained-item identity check.
  const current = () => isActive() && (isTextEstimate || generation === scanDraftGeneration) && scannedFoodItems.includes(food) && !controller?.signal.aborted;

  try {
    const response = await fetch(isTextEstimate ? "/api/foods/estimate-text" : "/api/foods/correct-image-item", {
      method: "POST",
      ...(controller ? { signal: controller.signal } : {}),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(isTextEstimate
        ? {
            description: `${correction}. Estimate one portion${food.servingGrams ? ` of about ${food.servingGrams} g` : ""}.`,
          }
        : {
            imageDataUrl: scannedFoodAnalysis.imageDataUrl,
            currentFood: {
              name: food.name,
              servingGrams: food.servingGrams,
            },
            correction,
          }),
    });
    const data = await response.json().catch(() => ({}));
    if (!current()) return;
    if (!response.ok) throw new Error(data.error || "Food correction failed.");

    const correctedFood = isTextEstimate ? data.analysis?.foods?.[0] : data.food;
    if (!correctedFood) throw new Error("Food correction failed.");
    const corrected = createScannedFoodItem(
      { ...correctedFood, source: isTextEstimate ? "AI ESTIMATE" : correctedFood.source },
      { inputMode: isTextEstimate ? "text" : "photo" },
    );
    Object.assign(food, corrected, {
      id: food.id,
      included: food.included,
      correctionOpen: false,
      correctionText: "",
      correctionStatus: "",
      isCorrecting: false,
    });
  } catch (error) {
    if (!current()) return;
    food.isCorrecting = false;
    food.correctionStatus = isTextEstimate
      ? "We couldn't update this estimate. Try again."
      : "We couldn't update this food. Try again or cancel the change.";
  }

  if (scanCorrectionController === controller) scanCorrectionController = null;
  renderScanReview();
}

function addSelectedScannedFoods() {
  if (scanEditingFoodId) { photoPlateBack(); return; }
  const selected = scannedFoodItems.filter((food) => food.included && food.name.trim());
  if (!validateScannedFoodAmounts(selected)) return;
  logScannedFoods(selected, elements.scanReviewMeal.value);
}

function addSimpleScannedFoods() {
  const selected = scannedFoodItems.filter((food) => food.included && food.name.trim());
  if (!selected.length) return;
  if (!validateScannedFoodAmounts(selected)) return;
  const amount = portionMath.parseDecimalAmount(elements.foodAmount.value);
  if (amount.state !== "valid" || portionMath.amountError(amount.value)) return;

  const baseTotals = Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => [
    key,
    selected.reduce((sum, food) => sum + Number(food[key] || 0), 0),
  ]));
  const desiredTotals = {
    calories: Math.max(0, Number(elements.manualFoodCalories.value || 0)),
    protein: Math.max(0, Number(elements.manualFoodProtein.value || 0)),
    carbs: Math.max(0, Number(elements.manualFoodCarbs.value || 0)),
    fat: Math.max(0, Number(elements.manualFoodFat.value || 0)),
  };
  const quantityMultiplier = selectedFoodBase
    ? portionMultiplier(selectedFoodBase, amount.value, elements.foodUnit.value)
      / Math.max(0.1, Number(selectedFoodBase.scanInitialMultiplier || 1))
    : 1;

  const scaledFoods = selected.map((food) => {
    const scaled = { ...food };
    scaled.amount = Math.round(Number(food.amount || 1) * quantityMultiplier * 10) / 10;
    ["calories", "protein", "carbs", "fat"].forEach((key) => {
      scaled[key] = baseTotals[key] > 0
        ? Math.round(Number(food[key] || 0) * (desiredTotals[key] / baseTotals[key]) * 10) / 10
        : Math.round((desiredTotals[key] / selected.length) * 10) / 10;
    });
    return scaled;
  });

  logScannedFoods(scaledFoods, elements.foodMeal.value);
}

async function logScannedFoods(foods, meal) {
  if (!foods.length) return;
  if (entryCommits.has('food')) return;
  entryCommits.add('food'); elements.scanAddSelectedFoods.disabled = elements.manualFoodSubmit.disabled = true;
  const photo = await photoEditor.ready(), date = state.selectedDate;
  if (!isActive() || photo.cancelled) { entryCommits.delete('food'); elements.scanAddSelectedFoods.disabled = elements.manualFoodSubmit.disabled = false; return; }
  // Stage the whole reviewed plate, then confirm one diary write before any
  // library updates, UI reset or success. A failed write leaves review intact.
  let day = currentDay();
  const staged = [];
  const photoPlate=scannedFoodAnalysis?.inputMode==='photo',generation=scanDraftGeneration;
  let captureId,lease;
  try {
    if (photoPlate) captureId=await captureDraft.stage(photo);
    if (!isActive() || generation!==scanDraftGeneration) {
      if(captureId)await foodMedia.settle([captureId]).catch(()=>{});
      entryCommits.delete('food');return;
    }
    if (captureId) lease=await foodMedia.hold([captureId]);
    if(captureId && !lease.ids.includes(captureId)){captureDraft.clear();throw Error('Photo is no longer available.');}
    if(!isActive() || generation!==scanDraftGeneration){entryCommits.delete('food');return;}
    for (const food of [...foods].reverse()) {
      const result = addFood({...scannedFoodToReusableEntry(food, meal),...(captureId?{captureId}:{})}, { stageDay: day });
      day = result.day; staged.push(result);
    }
    state = commitDiaryDay(localStorage, state, day);
  } catch {
    if(captureId)await foodMedia.settle([captureId],{recovery:hasRecoverablePhoto(captureId)}).catch(()=>{});
    const message = "Could not save this food on this device. Your review is still here. Try Add again or check the storage warning.";
    if (elements.foodSection.classList.contains("is-reviewing-scan")) {
      entryStatus(elements.scanReviewFooter, message);
    } else entryStatus(elements.manualFoodForm, message);
    entryCommits.delete('food'); elements.scanAddSelectedFoods.disabled = elements.manualFoodSubmit.disabled = false;
    return;
  } finally { await lease?.release().catch(()=>{});collectFoodMediaSoon(); }
  if(captureId)await foodMedia.settle([captureId]).catch(()=>{});
  if(!photoPlate)await attachDiaryPhoto(staged.map(item => item.addedId), photo, date);
  if (!isActive()) { entryCommits.delete('food'); return; }
  recentSuccess = { collection: "foods", id: staged.at(-1).addedId, ...(captureId ? {message:`Scanned meal added · ${foods.length} ${foods.length===1?'food':'foods'}.`} : {}) };
  rememberFoods(state.days[date].foods.filter(food => staged.some(item => item.addedId === food.id)).map(nextFood => ({ ...nextFood, source: foodSource(nextFood) || "Manual", lastUsedAmount: nextFood.amount, lastUsedUnit: nextFood.unit })));
  addSurface.committed(entryTap);
  render();
  closeMobileLogForm(elements.foodSection);
  resetFoodForm();
  entryCommits.delete('food'); elements.scanAddSelectedFoods.disabled = elements.manualFoodSubmit.disabled = false;
}

function validateScannedFoodAmounts(foods) {
  for (const food of foods) {
    const card = elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"]`);
    const input = card?.querySelector('[data-scan-field="amount"]');
    const candidate = input ? input.value : food.amount;
    const message = portionMath.amountError(candidate);
    if (!message) continue;
    food.detailsOpen = true;
    renderScanReview();
    const visibleInput = elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"] [data-scan-field="amount"]`);
    if (visibleInput) {
      visibleInput.setCustomValidity(message);
      visibleInput.reportValidity();
      visibleInput.focus();
    }
    return false;
  }
  return true;
}

function resizeImageForAnalysis(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1280;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.82));
      };
      image.onerror = () => reject(new Error("Could not read this image."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Could not read this image."));
    reader.readAsDataURL(file);
  });
}

function addFood(food, options = {}) {
  const currentTime = new Date();
  const now = currentTime.toISOString();
  const loggedForDate = state.selectedDate;
  const newEntryTimestamp = foodPersistence.timestampForNewDiaryEntry(loggedForDate, { now: currentTime });
  const excludedFromStreak = isFutureDateKey(loggedForDate);
  const existingEntry = editingFoodId
    ? currentDay().foods.find((entry) => entry.id === editingFoodId)
    : null;
  const identifiedFood = foodPersistence.ensureStableFoodIdentity({
    ...existingEntry,
    ...food,
  }, {
    idFactory: () => localRecordId(),
  });
  const nextFood = {
    ...identifiedFood,
    calories: Math.round(Number(food.calories || 0)),
    protein: roundNutritionValue(food.protein),
    carbs: roundNutritionValue(food.carbs),
    fat: roundNutritionValue(food.fat),
  };
  let addedId = null;
  const sourceDay = options.stageDay || currentDay();
  const day = { ...sourceDay, foods: [...sourceDay.foods] };
  if (editingFoodId) {
    day.foods = day.foods.map((entry) =>
      entry.id === editingFoodId
        ? {
          ...entry,
          ...nextFood,
          id: entry.id,
          loggedForDate: foodLoggedForDate(entry, loggedForDate),
          excludedFromStreak: entry.excludedFromStreak ?? isFutureDateKey(foodLoggedForDate(entry, loggedForDate)),
          updatedAt: now,
        }
        : entry,
    );
  } else {
    addedId = localRecordId();
    day.foods.unshift({
      ...nextFood,
      id: addedId,
      loggedAt: newEntryTimestamp,
      createdAt: newEntryTimestamp,
      loggedForDate,
      excludedFromStreak,
    });
  }
  if (options.stageDay) return { day, nextFood, addedId };
  state = commitDiaryDay(localStorage, state, day);
  if (addedId) recentSuccess = { collection: "foods", id: addedId };
  if (options.deferPhoto) return addedId || editingFoodId;
  rememberFoods([{
    ...nextFood,
    source: foodSource(nextFood) || "Manual",
    lastUsedAmount: nextFood.amount,
    lastUsedUnit: nextFood.unit,
  }]);
  render();
  return addedId;
}

const entryCommits = new Set();
let entryTap;
for (const button of [elements.manualFoodSubmit, elements.exerciseSubmit]) {
  button.addEventListener('click', event => { entryTap = event; });
}
function entryStatus(form, message = '') {
  let node = document.getElementById(form.id+'Status') || form.querySelector('.add-entry-status');
  if (!node) { node = document.createElement('p'); node.className = 'add-entry-status'; node.setAttribute('role', 'alert'); node.tabIndex = -1; form.append(node); }
  node.textContent = message; node.hidden = !message;
  if(message)addSurface.reveal(document.activeElement);
  return node;
}
function entryErrors(form, errors, focus = true) {
  form.querySelectorAll('input,select').forEach(input => {
    const message = errors[input.id] || '';
    let node = document.getElementById(input.id + 'Error');
    if (!node && message) { node = document.createElement('span'); node.id = input.id + 'Error'; node.className = 'add-entry-error'; node.setAttribute('role', 'alert'); input.closest('label')?.append(node); input.setAttribute('aria-describedby', [input.getAttribute('aria-describedby'), node.id].filter(Boolean).join(' ')); }
    if (node) { node.textContent = message; node.hidden = !message; }
    input.setCustomValidity('');
    if (message) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  });
  if (focus && Object.keys(errors).length) { const input=document.getElementById(Object.keys(errors)[0]);input?.focus({ preventScroll: true });addSurface.reveal(input); }
  return Object.keys(errors).length === 0;
}
function foodEntryValues() { return { name: elements.manualFoodName.value, amount: elements.foodAmount.value, calories: elements.manualFoodCalories.value, protein: elements.manualFoodProtein.value, carbs: elements.manualFoodCarbs.value, fat: elements.manualFoodFat.value }; }
for (const form of [elements.manualFoodForm, elements.exerciseForm]) {
  form.noValidate = true;
  form.addEventListener('input', event => {
    if (event.target.getAttribute('aria-invalid') === 'true') {
      const errors = form === elements.manualFoodForm ? validateFoodEntry(foodEntryValues(), portionMath.amountError) : validateExerciseEntry({ minutes: elements.exerciseMinutes.value, calories: elements.exerciseCalories.value });
      entryErrors(form, errors, false);
    }
  });
}
elements.manualFoodForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (entryCommits.has('food')) return;
  if (elements.foodSection.classList.contains("is-reviewing-scan")) {
    addSelectedScannedFoods();
    return;
  }
  if (scannedFoodItems.length && selectedFoodBase) {
    addSimpleScannedFoods();
    return;
  }
  if (!selectedFoodBase && !editingFoodId) return;
  const errors = validateFoodEntry(foodEntryValues(), portionMath.amountError);
  if (hasSourceNutritionSummary() && Object.keys(errors).some(id => /^manualFood(Calories|Protein|Carbs|Fat)$/.test(id))) {
    foodNutritionEditing = true;syncFoodNutritionMode();
  }
  if (!entryErrors(elements.manualFoodForm, errors)) return;
  entryStatus(elements.manualFoodForm);
  const parsedAmount = portionMath.parseDecimalAmount(elements.foodAmount.value);
  const amount = parsedAmount.value;
  const isEditing = Boolean(editingFoodId);
  entryCommits.add('food'); elements.manualFoodSubmit.disabled = true;
  try {
  const photo = await photoEditor.ready(), date = state.selectedDate;
  if (!isActive() || photo.cancelled) return;
  const addedId = addFood({
    catalogId: selectedFoodBase?.catalogId || "",
    sourceId: selectedFoodBase?.sourceId || "",
    localFoodId: selectedFoodBase?.localFoodId || "",
    reusableFoodId: selectedFoodBase?.reusableFoodId || "",
    // The field displays sentence case; only an explicit name input event
    // replaces the raw canonical name held in selectedFoodBase.
    name: (selectedFoodBase?.name ?? elements.manualFoodName.value).trim(),
    ...(selectedFoodBase?.nameEdited === true ? { nameEdited: true } : {}),
    brand: selectedFoodBase?.brand || "",
    source: foodSource(selectedFoodBase) || "Manual",
    serving: selectedFoodBase?.serving || "",
    servingGrams: Number(selectedFoodBase?.servingGrams || 0) || null,
    servingMl: Number(selectedFoodBase?.servingMl || 0) || null,
    amount,
    unit: elements.foodUnit.value,
    meal: elements.foodMeal.value,
    nutritionOverridden: foodNutritionOverridden,
    calories: decimalValue(elements.manualFoodCalories.value),
    protein: decimalValue(elements.manualFoodProtein.value, true),
    carbs: decimalValue(elements.manualFoodCarbs.value, true),
    fat: decimalValue(elements.manualFoodFat.value, true),
    photoMediaId: photo.normalized ? (editingFoodId ? selectedFoodBase?.photoMediaId : undefined) : photo.id || undefined,
  }, { deferPhoto: true });
  await attachDiaryPhoto([addedId], photo, date);
  if (!isActive()) return;
  rememberFoods(state.days[date].foods.filter(food => food.id === addedId));
  collectFoodMediaSoon(); render();
  addSurface.committed(entryTap);entryTap=null;
  closeEditLogForm(elements.foodSection);
  resetFoodForm();
  if (!isEditing && !isPhoneAddFoodLayout()) playSubmitSuccess(elements.manualFoodSubmit);
  } catch (error) {
    entryStatus(elements.manualFoodForm, error?.code === 'local-id-unavailable' ? 'This browser could not create an entry. Update the browser and try again. Your draft is still here.' : 'Could not save this food on this device. Your draft is still here. Check storage and try again.');
  } finally { entryCommits.delete('food'); elements.manualFoodSubmit.disabled = false; }
});

const searchClear = document.createElement("button");
searchClear.type = "button"; searchClear.className = "ux-search-clear"; searchClear.textContent = "×";
searchClear.setAttribute("aria-label", "Clear food search"); searchClear.hidden = true;
elements.manualFoodName.after(searchClear);
function syncSearchClear() { searchClear.hidden = !elements.manualFoodName.value || elements.manualFoodName.readOnly || elements.foodSection.classList.contains("is-detailing"); }
searchClear.addEventListener("pointerdown", event => event.preventDefault());
searchClear.addEventListener("click", () => {
  elements.manualFoodName.value = "";
  elements.manualFoodName.dispatchEvent(new Event("input", { bubbles: true }));
  elements.manualFoodName.focus({ preventScroll: true });
});
elements.manualFoodName.addEventListener("focus", syncSearchClear);
new MutationObserver(syncSearchClear).observe(elements.foodSection, { attributes: true, attributeFilter: ["class"] });
elements.manualFoodName.addEventListener("input", () => {
  syncSearchClear();
  if (editingFoodId) return;
  if (elements.foodSection.classList.contains("is-manual-entry")) {
    if (selectedFoodBase && !elements.manualFoodName.readOnly) {
      selectedFoodBase.name = elements.manualFoodName.value;
      selectedFoodBase.nameEdited = true;
    }
    elements.manualFoodSubmit.disabled = false;
    return;
  }
  selectedFoodBase = null;
  cancelFoodSearch();
  foodSearchError = "";
  if (!elements.manualFoodName.value.trim()) { showBrowseFoodSuggestions(); return; }
  renderSuggestions(searchFoodLibrary(elements.manualFoodName.value));
  elements.foodSuggestions.querySelector(".food-search-fallbacks")?.remove();
  foodSearchPending = true;
  elements.searchNote.textContent = "Searching foods…";
  autocompleteTimer = setTimeout(() => searchFoodSuggestions(elements.manualFoodName.value), 350);
});

elements.manualFoodName.addEventListener("keydown", event => {
  if (event.key !== "Enter" || event.isComposing || elements.foodSection.classList.contains("is-detailing")) return;
  event.preventDefault();
  searchFoodSuggestions(elements.manualFoodName.value);
  elements.manualFoodName.blur();
});
elements.foodMeal.addEventListener("change", syncFoodSubmitLabel);

elements.foodAmount.addEventListener("input", () => {
  elements.foodAmount.setCustomValidity("");
  updateNutritionForPortion();
});
elements.foodUnit.addEventListener("change", () => {
  updateFoodAmountForUnit();
  syncFoodPortionNote();
  updateNutritionForPortion();
});
// Feedback only: native click still owns activation and native scrolling can
// cancel a touch. Mobile browsers do not consistently hold CSS :active.
function bindNutritionActionPress() {
  const button = elements.editFoodNutrition;
  let pointer = null;
  const clear = () => { pointer = null; button.classList.remove('is-pressed'); };
  button.addEventListener('pointerdown', event => {
    if (!editingFoodId || !isPhoneAddFoodLayout() || !event.isPrimary || event.button !== 0) return;
    pointer = { id: event.pointerId, x: event.clientX, y: event.clientY };
    button.classList.add('is-pressed');
  });
  window.addEventListener('pointermove', event => {
    if (pointer?.id === event.pointerId && Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y) > 8) clear();
  }, { passive: true });
  for (const type of ['pointerup', 'pointercancel']) window.addEventListener(type, event => {
    if (pointer?.id === event.pointerId) clear();
  }, true);
  window.addEventListener('blur', clear);
  document.addEventListener('touchcancel', clear);
  document.addEventListener('intake:press-reset', clear);
  document.addEventListener('scroll', clear, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') clear(); });
  onDispose(clear);
}
bindNutritionActionPress();
elements.editFoodNutrition.addEventListener("click", () => {
  if (!hasSourceNutritionSummary()) return;
  inlineReveal.cancel();
  // Hide is not Save. Keep invalid raw values and their associated errors
  // visible instead of hiding them behind a zero-valued compact summary.
  if (editingFoodId && foodNutritionEditing) {
    const errors = validateFoodEntry(foodEntryValues(), portionMath.amountError);
    if (Object.keys(errors).some(id=>/^manualFood(Calories|Protein|Carbs|Fat)$/.test(id))) {
      entryErrors(elements.manualFoodForm, errors, false);
      return;
    }
  }
  foodNutritionEditing = !foodNutritionEditing;
  if (!foodNutritionEditing) syncFoodNutritionSummaryFromInputs();
  syncFoodNutritionMode();
  if (foodNutritionEditing) {
    // The stable Nutrition row anchors Edit. Other Add details retain their
    // existing layout, where the summary/action can follow the fields.
    const nutritionRegion=()=>disclosureRegion([elements.foodNutritionSummary,
      ...[elements.manualFoodCalories,elements.manualFoodProtein,elements.manualFoodCarbs,elements.manualFoodFat].map(input=>input.closest('label'))]);
    revealInline(elements.editFoodNutrition,nutritionRegion,
      {policy:'content-focus',anchor:editingFoodId ? elements.editFoodNutrition : nutritionRegion,isCurrent:()=>foodNutritionEditing && hasSourceNutritionSummary()});
  }
  if (isPhoneAddFoodLayout()) {
    const targets = foodNutritionEditing
      ? [elements.manualFoodCalories, elements.manualFoodProtein, elements.manualFoodCarbs, elements.manualFoodFat].map(input => input.closest('label'))
      : [elements.foodNutritionGrid];
    targets.forEach(target => window.IntakeMotion?.reveal(target, { duration: 160 }));
  }
});
[elements.manualFoodCalories, elements.manualFoodProtein, elements.manualFoodCarbs, elements.manualFoodFat]
  .forEach((input) => input.addEventListener("input", () => {
    if (!selectedFoodBase) return;
    if (hasSourceNutritionSummary() && !foodNutritionEditing) return;
    const amount = currentFoodAmount();
    if (amount === null || portionMath.amountError(amount)) return;
    const multiplier = portionMultiplier(selectedFoodBase, amount, elements.foodUnit.value);
    if (!multiplier) return;
    const fieldByInput = new Map([
      [elements.manualFoodCalories, "calories"],
      [elements.manualFoodProtein, "protein"],
      [elements.manualFoodCarbs, "carbs"],
      [elements.manualFoodFat, "fat"],
    ]);
    const field = fieldByInput.get(input);
    const value = decimalValue(input.value, field !== 'calories');
    if (!Number.isFinite(value)) return;
    selectedFoodBase[field] = Math.max(0, value) / multiplier;
    foodNutritionOverridden = true;
    syncFoodNutritionSummaryFromInputs();
  }));
elements.scanFoodList.addEventListener("input", (event) => {
  const correctionInput = event.target.closest("[data-scan-correction-input]");
  const input = event.target.closest("[data-scan-field]");
  const card = event.target.closest("[data-scan-food-id]");
  if (!card) return;
  const food = scannedFoodItems.find((item) => item.id === card.dataset.scanFoodId);
  if (!food) return;
  if (elements.scanSaveMealStatus) elements.scanSaveMealStatus.textContent = "";

  if (correctionInput) {
    food.correctionText = correctionInput.value;
    food.correctionStatus = "";
    const submit = card.querySelector('[data-scan-action="apply-correction"]');
    if (submit) submit.disabled = food.correctionText.trim().length < 2;
    return;
  }

  if (!input) return;

  const field = input.dataset.scanField;
  if (field === "name") {
    food.name = input.value;
    food.nameEdited = true;
  } else if (field === "amount") {
    const parsedAmount = portionMath.parseDecimalAmount(input.value);
    if (parsedAmount.state !== "valid" || portionMath.amountError(parsedAmount.value)) return;
    food.amount = parsedAmount.value;
    input.setCustomValidity('');
    updateScanFoodPortion(food);
    syncScanCardNutrition(card, food);
  } else if (["calories", "protein", "carbs", "fat"].includes(field)) {
    food[field] = Math.max(0, Number(input.value || 0));
    const multiplier = scannedFoodMultiplier(food);
    food.baseNutrition[field] = multiplier ? food[field] / multiplier : food[field];
    food.nutritionOverridden = true;
    food.manualNutritionOverride = Object.fromEntries(["calories", "protein", "carbs", "fat"].map((key) => [
      key,
      Math.max(0, Number(food[key] || 0)),
    ]));
  }
  updateScanReviewTotals();
});
elements.scanFoodList.addEventListener("change", (event) => {
  const select = event.target.closest('[data-scan-field="unit"]');
  const card = event.target.closest("[data-scan-food-id]");
  if (!select || !card) return;
  const food = scannedFoodItems.find((item) => item.id === card.dataset.scanFoodId);
  if (!food) return;
  food.unit = select.value;
  food.amount = food.unit === "g"
    ? food.servingGrams
    : food.unit === "ml"
      ? food.servingMl
      : 1;
  updateScanFoodPortion(food);
  renderScanReview();
});
elements.scanFoodList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-scan-action]");
  const card = event.target.closest("[data-scan-food-id]");
  if (!button || !card) return;
  const food = scannedFoodItems.find((item) => item.id === card.dataset.scanFoodId);
  if (!food) return;
  if (button.dataset.scanAction === 'edit') {
    addSurface.captureParent('plate-summary');
    const content = elements.foodSection.querySelector('.add-flow-content');
    plateSummaryScroll = content?.scrollTop || 0;
    scanEditingFoodId = food.id; renderScanReview();
    if (content) content.scrollTop = 0;
    animateFoodStep(content, 'forward', window);
    elements.scanReviewTitle.setAttribute('tabindex', '-1'); elements.scanReviewTitle.focus({ preventScroll: true });
  } else if (button.dataset.scanAction === "toggle") {
    scanCorrectionController?.abort(); scanCorrectionController = null; scanDraftGeneration++;
    food.included = !food.included;
    scanRemovedFoodId = food.included ? null : food.id;
    if (scannedFoodAnalysis?.inputMode === 'photo') scanEditingFoodId = null;
    renderScanReview();
    if (scannedFoodAnalysis?.inputMode === 'photo') elements.scanReviewTitle.focus({ preventScroll: true });
  } else if (button.dataset.scanAction === "correct") {
    if (food.correctionOpen) {
      scanCorrectionController?.abort(); scanCorrectionController = null; scanDraftGeneration++;
      food.isCorrecting = false; food.correctionText = '';
    }
    food.correctionOpen = !food.correctionOpen;
    if (food.correctionOpen) food.detailsOpen = false;
    food.correctionStatus = "";
    renderScanReview();
    if (food.correctionOpen) {
      const current = elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"]`);
      revealInline(current.querySelector('[data-scan-action=correct]'),current.querySelector('.scan-food-correction'),{isCurrent:()=>food.correctionOpen});
      // Existing correction-field focus/keyboard behavior takes authority and
      // cancels the queued disclosure reveal before it can compete.
      elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"] [data-scan-correction-input]`)?.focus();
    }
  } else if (button.dataset.scanAction === "apply-correction") {
    correctScannedFood(food.id);
  } else if (button.dataset.scanAction === "details") {
    const hadFocus = document.activeElement === button;
    food.detailsOpen = !food.detailsOpen;
    if (food.detailsOpen) food.correctionOpen = false;
    renderScanReview();
    const current = elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"]`);
    const trigger = current.querySelector('[data-scan-action=details]');
    if (hadFocus) trigger.focus({preventScroll:true});
    if (food.detailsOpen) revealInline(trigger,() => [...current.querySelectorAll('.scan-food-fields:not(.scan-item-portion),.scan-food-nutrition-basis,.scan-food-notes')],{isCurrent:()=>food.detailsOpen});
  } else if (button.dataset.scanAction === "adjust-amount") {
    const adjustment = food.unit === "g" ? 25 : food.unit === "ml" ? 50 : 0.5;
    food.amount = Math.max(0.1, Math.round((Number(food.amount || 0) + adjustment * Number(button.dataset.scanAdjustment || 0)) * 10) / 10);
    updateScanFoodPortion(food);
    renderScanReview();
    const selector = `[data-scan-food-id="${food.id}"] [data-scan-action="adjust-amount"][data-scan-adjustment="${button.dataset.scanAdjustment}"]`;
    requestAnimationFrame(() => elements.scanFoodList.querySelector(selector)?.focus());
  }
});
elements.scanFoodList.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !event.target.matches("[data-scan-correction-input]")) return;
  event.preventDefault();
  const card = event.target.closest("[data-scan-food-id]");
  if (card) correctScannedFood(card.dataset.scanFoodId);
});
elements.openScanReview.addEventListener("click", showScannedFoodsReview);
document.querySelector('#scanRemoveUndo').addEventListener('click', () => {
  const food = scannedFoodItems.find(item => item.id === scanRemovedFoodId);
  if (!food) return;
  food.included = true; scanRemovedFoodId = null; renderScanReview();
  elements.scanFoodList.querySelector(`[data-scan-food-id="${food.id}"]`)?.focus({ preventScroll: true });
});
elements.closeScanReview.addEventListener("click", () => {
  elements.foodMeal.value = elements.scanReviewMeal.value;
  if (scannedFoodAnalysis?.inputMode === "text") {
    elements.scanReview.hidden = true;
    elements.foodSection.classList.remove("is-detailing", "is-reviewing-scan", "is-reviewing-text-estimate");
    openFoodAiDescription();
    return;
  }
  photoPlateBack();
});
elements.scanAddSelectedFoods.addEventListener("click", event => { entryTap = event; addSelectedScannedFoods(); });
elements.scanNoFoodRetry?.addEventListener("click", () => { if (!photoPlateBack()) scanner.open(); });
elements.scanNoFoodManual?.addEventListener("click", () => {
  if (elements.foodSection.classList.contains('is-photo-plate')) resetFoodForm();
  leaveNoFoodResult();
  fillManualFood({ name: "", source: "Manual", serving: "1 serving", servingGrams: null, calories: 0, protein: 0, carbs: 0, fat: 0 }, { editableName: true });
  elements.foodEditName.textContent = "Manual food";
  elements.manualFoodName.focus();
});
elements.scanReviewMeal?.addEventListener("change", () => {
  elements.foodMeal.value = elements.scanReviewMeal.value;
  if (elements.scanSaveMealStatus) elements.scanSaveMealStatus.textContent = "";
});
elements.scanSaveAsMeal?.addEventListener("click", () => {
  if (!selectedScannedFoods().length) return;
  const meal = elements.foodSection.classList.contains('is-reviewing-scan') ? elements.scanReviewMeal.value : elements.foodMeal.value || defaultMealForNow();
  elements.scanReviewMeal.value = meal;
  openFoodReusePanel("save-scan-meal-name", { selectedMeal: meal });
});
elements.foodLogOptionsButton?.addEventListener("click", () => openFoodReusePanel("menu", {
  sourceDate: previousDayKey(state.selectedDate),
  selectedMeal: "",
  savedMealId: "",
}));

elements.foodList.addEventListener("click", event => {
  const action = event.target.closest("[data-empty-food-action]")?.dataset.emptyFoodAction;
  if (action === "add" || action === "scan") {
    openAddFoodFromFab();
    if (action === "scan") elements.foodScanButton.click();
  }
  if (action === "reuse") {
    const sourceDate = latestReusableDay(state.days, state.selectedDate);
    openFoodReusePanel("menu", { sourceDate, opener: event.target.closest('[data-empty-food-action]') });
  }
});

elements.exerciseList.addEventListener('click', event => {
  if (event.target.closest('[data-empty-exercise-action="add"]')) openAddExerciseFromFab();
});
elements.foodReuseClose?.addEventListener("click", () => closeFoodReusePanel());
const releaseAddBack = [elements.foodSection, elements.exerciseSection].map(section => bindSemanticBack(section,
  () => {
    if (!isPhoneAddFoodLayout() || addSurface.section !== section || foodReuseState.open || reuseSheet?.active || document.querySelector('dialog[open]')) return null;
    // Only item -> summary has a retained parent presentation. The separate
    // scanner/replacement states use visible Back; never reveal Today under
    // a drag that will actually return to a different scanner/editor state.
    if (section.matches('.is-photo-plate')) {
      const food = scannedFoodItems.find(item => item.id === scanEditingFoodId);
      return food && !food.correctionOpen ? elements.closeFoodModal : null;
    }
    if (section.matches('.is-reviewing-scan')) return null;
    if (section.matches('.is-describing-ai')) return aiDescriptionPending ? null : elements.foodAiDescriptionBack;
    return section === elements.foodSection ? elements.closeFoodModal : elements.closeExerciseModal;
  }, window, {
    // Results and loading classes are not navigation. An async search must not
    // snap an otherwise valid drag back to zero.
    getState: () => addBackState(section),
    createMotion: () => addSurface.backMotion(addBackParent(section)),
    // Both modes permit an edge Back after a native picker/keyboard closes,
    // even when iOS retains focus in that form. Never steal from an open keyboard.
    allowFocusedControl: field => section.contains(field) && section.dataset.keyboard === 'false',
  }));
function addBackParent(section) {
  if (section !== elements.foodSection) return null;
  if (scanEditingFoodId) return 'plate-summary';
  if (section.matches('.is-describing-ai')) return 'description';
  return mobileBrowseState && section.classList.contains('is-detailing') && !editingFoodId ? 'browse' : null;
}
function addBackState(section) {
  return [addBackParent(section),section.querySelector('form').dataset.foodDetail || '',editingFoodId,scanEditingFoodId].join('|');
}
onDispose?.(() => { scanDraftGeneration++; scanCorrectionController?.abort(); scanPhotoSession = null; cancelFoodSearch(); releaseAddBack.forEach(release => release()); reuseSheet?.dispose(); });
function backFoodReusePanel() {
  if (foodReuseState.view === "rename-saved-meal") {
    returnFromSavedMealRename();
    return;
  }
  if (foodReuseState.view === "save-meal-name") foodReuseState.view = "save-meal-picker";
  else if (foodReuseState.view === "saved-meal-review") {
    if (foodReuseState.savedMealReturnView === 'saved-meals') foodReuseState.view = 'saved-meals';
    else { closeFoodReusePanel(); return; }
  } else if (foodReuseState.view === 'menu' || foodReuseState.view === 'row-actions' || foodReuseState.view === 'recent-actions' || foodReuseState.view === 'save-scan-meal-name') {
    closeFoodReusePanel(); return;
  } else foodReuseState.view = "menu";
  renderFoodReusePanel();
  const origin = foodReuseState.view === 'saved-meals' && [...elements.foodReuseContent.querySelectorAll('[data-saved-meal-id]')].find(button => button.dataset.savedMealId === foodReuseState.savedMealId);
  (origin || elements.foodReuseContent.querySelector('button,input,select') || elements.foodReuseBack)?.focus({preventScroll:true});
}
elements.foodReuseBack?.addEventListener("click", backFoodReusePanel);

async function deleteSavedMealWithUndo(savedMeal) {
  let photoLease;
  if(mediaIdValid(savedMeal.coverImageId)){
    try{photoLease=await holdUndoPhotos([savedMeal.coverImageId]);}catch{setFoodReuseStatus('Could not protect the meal photo for Undo. Please try again.',true);return;}
    if(!isActive()){photoLease?.release();return;}
  }
  const previous = savedMeals, index = savedMeals.findIndex(meal => meal.id === savedMeal.id);
  if (index < 0) {photoLease?.release();return;}
  savedMeals = savedMeals.filter(meal => meal.id !== savedMeal.id);
  try { saveSavedMeals(); } catch { photoLease?.release();savedMeals = previous; setFoodReuseStatus('The saved meal could not be deleted. Please try again.', true); return; }
  renderSavedFoods();
  backFoodReusePanel();
  showUndoToast('Saved meal deleted.', () => {
    const current = savedMeals;
    savedMeals = foodReuse.restoreRemovedItem(savedMeals, savedMeal, index);
    try { saveSavedMeals(); } catch { savedMeals = current; elements.searchNote.textContent = 'The saved meal could not be restored. Please try again.'; return; }
    renderSavedFoods();
    if (foodReuseState.open && foodReuseState.view === 'saved-meals') {
      renderFoodReusePanel();
      [...elements.foodReuseContent.querySelectorAll('[data-saved-meal-id]')].find(button => button.dataset.savedMealId === savedMeal.id)?.focus({preventScroll:true});
    }
  }, { reuse: true, photoLease });
  collectFoodMediaSoon();
}
elements.foodReuseContent?.addEventListener("change", (event) => {
  const dateInput = event.target.closest("[data-reuse-source-date]");
  if (!dateInput) return;
  foodReuseState.sourceDate = dateInput.value;
  renderFoodReusePanel();
});
elements.foodReuseContent?.addEventListener("submit", (event) => {
  const renameForm = event.target.closest("[data-reuse-rename-form]");
  if (renameForm) {
    event.preventDefault();
    submitSavedMealRename(renameForm);
    return;
  }
  const form = event.target.closest("[data-reuse-save-form]");
  if (!form) return;
  event.preventDefault();
  const name = new FormData(form).get("mealName");
  if (!String(name || "").trim()) {
    form.querySelector("[name='mealName']")?.focus();
    return;
  }
  if (foodReuseState.view === "save-scan-meal-name") saveMealFromScanReview(name);
  else saveMealFromSelectedGroup(name);
});
elements.foodReuseContent?.addEventListener("click", (event) => {
  if (!foodReuseState.open) return;
  const recentAction = event.target.closest('[data-recent-action]')?.dataset.recentAction;
  if (recentAction && foodReuseState.view === 'recent-actions') {
    const food = foodLibrary.find(item => foodIdentityKey(item) === foodReuseState.recentFoodKey);
    closeFoodReusePanel({ immediate: true, restoreFocus: false });
    if (food) runRecentFoodAction(recentAction, food);
    return;
  }
  const entryAction = event.target.closest('[data-entry-action]')?.dataset.entryAction;
  if (entryAction) {
    const entry = currentDay().foods.find(food => food.id === foodReuseState.entryId);
    closeFoodReusePanel({immediate:true});
    if (entry) {
      runFoodEntryAction(entryAction, entry);
      if (entryAction !== 'edit') {
        const replacement = [...elements.foodList.querySelectorAll('[data-food-entry-id]')].find(card => card.dataset.foodEntryId === entry.id);
        (replacement?.querySelector('.entry-actions-toggle') || document.querySelector('#undoToast button') || elements.foodLogOptionsButton)?.focus({preventScroll:true});
      }
    }
    return;
  }
  const button = event.target.closest("[data-reuse-action]");
  if (!button) return;
  const action = button.dataset.reuseAction;

  if (action === "repeat-yesterday") {
    const sourceDate = previousDayKey(state.selectedDate);
    const foods = foodEntriesForDate(sourceDate);
    if (!foods.length) {
      elements.foodReuseTitle.textContent = "Repeat yesterday";
      renderFoodReuseEmpty("No food logged yesterday.", true);
      return;
    }
    confirmAndCopyFoods(foods, {
      sourceDate,
      successMessage: `${foods.length} ${foods.length === 1 ? "food" : "foods"} ${isPhoneAddFoodLayout() ? "repeated" : "copied"} from yesterday.`,
    });
    return;
  }
  if (["repeat-meal", "copy-date", "save-meal-picker", "saved-meals"].includes(action)) {
    foodReuseState.view = action;
    if (action === "repeat-meal") foodReuseState.sourceDate = previousDayKey(state.selectedDate);
    renderFoodReusePanel();
    return;
  }
  if (action === "copy-day") {
    const foods = foodEntriesForDate(foodReuseState.sourceDate);
    confirmAndCopyFoods(foods, {
      sourceDate: foodReuseState.sourceDate,
      successMessage: `${foods.length} ${foods.length === 1 ? "food" : "foods"} copied from ${formatReuseDate(foodReuseState.sourceDate)}.`,
    });
    return;
  }
  if (action === "copy-meal") {
    const meal = button.dataset.meal;
    const foods = foodEntriesForDate(foodReuseState.sourceDate).filter((food) => String(food.meal || "snack").toLowerCase() === meal);
    confirmAndCopyFoods(foods, {
      sourceDate: foodReuseState.sourceDate,
      targetMeal: meal,
      successMessage: `${mealLabel(meal).toLowerCase().replace(/^./, (letter) => letter.toUpperCase())} copied from ${formatReuseDate(foodReuseState.sourceDate)}.`,
    });
    return;
  }
  if (action === "name-saved-meal") {
    foodReuseState.selectedMeal = button.dataset.meal;
    foodReuseState.view = "save-meal-name";
    renderFoodReusePanel();
    return;
  }
  if (action === "add-saved-meal") {
    const savedMeal = savedMeals.find((meal) => meal.id === foodReuseState.savedMealId);
    const targetMeal = elements.foodReuseContent.querySelector("[data-saved-meal-target]")?.value || savedMeal?.meal;
    if (!savedMeal) return;
    if (copyFoodEntries(savedMeal.foods.map(({ photoMediaId, coverImageId, ...food }) => foodPersistence.ensureStableFoodIdentity(food)), {
      targetMeal,
      successMessage: `${savedMeal.name} added.`,
    })) {
      closeMobileLogForm(elements.foodSection);
      resetFoodForm();
    }
    return;
  }
  if (action === "rename-saved-meal") {
    beginSavedMealRename();
    return;
  }
  if (action === "cancel-rename-saved-meal") {
    returnFromSavedMealRename();
    return;
  }
  if (action === "delete-saved-meal") {
    const savedMeal = savedMeals.find((meal) => meal.id === foodReuseState.savedMealId);
    if (savedMeal) deleteSavedMealWithUndo(savedMeal);
  }
});
elements.addFoodToggle.addEventListener("click", () => {
  openAddFoodFromFab();
});
elements.addModeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (button.dataset.addMode === "exercise") {
      openAddExerciseFromFab();
    } else {
      openAddFoodFromFab();
    }
  });
});
elements.closeFoodModal.addEventListener("click", () => {
  if (photoPlateBack()) return;
  if (mobileBrowseState && elements.foodSection.classList.contains("is-detailing") && !editingFoodId) {
    elements.cancelFoodEdit.click(); return;
  }
  const returnEntryId = editingFoodId;
  mobileBrowseState = null;
  closeEditLogForm(elements.foodSection);
  resetFoodForm();
  elements.foodSection.classList.remove("is-viewing-saved");
  if (returnEntryId) [...elements.foodList.querySelectorAll('[data-food-entry-id]')].find(card => card.dataset.foodEntryId === returnEntryId)?.querySelector('.entry-main')?.focus({preventScroll:true});
});
elements.backFoodModal.addEventListener("click", showFoodFormFromSavedFoods);
elements.cancelFoodEdit.addEventListener("click", () => {
  const wasEditing = Boolean(editingFoodId);
  const browse = !editingFoodId ? mobileBrowseState : null;
  if (browse) { restoreFoodBrowseState(browse); return; }
  if (wasEditing) closeEditLogForm(elements.foodSection);
  resetFoodForm();
  renderEntries();
  if (!wasEditing) elements.manualFoodName.focus();
});
elements.deleteFoodEdit.addEventListener("click", async () => {
  if (!editingFoodId || entryCommits.has('food')) return;
  const entry = currentDay().foods.find((food) => food.id === editingFoodId);
  if (!entry) return;
  if (!window.confirm("Delete this entry?")) return;
  entryCommits.add('food');elements.deleteFoodEdit.disabled = elements.manualFoodSubmit.disabled = true;
  try {
    if (!await deleteEntryWithUndo("foods", entry, {fromEditor:true}) || !isActive()) return;
    closeEditLogForm(elements.foodSection);
    resetFoodForm();
  } catch {
    entryStatus(elements.manualFoodForm, 'Could not delete this food on this device. Your draft is still here. Check storage and try again.');
  } finally {
    entryCommits.delete('food');elements.deleteFoodEdit.disabled = elements.manualFoodSubmit.disabled = false;
  }
});
// Filter presentation cache owns only local DOM/reading state, never storage.
// Invalidated by query/data changes; async search still uses its request guard.
const foodPeerCache = new Map();
let foodPeerScope = '';
const foodPeerFlags = ['has-food-suggestions', 'has-search-fallback', 'is-searching'];
function foodPeerSnapshot() {
  return {
    nodes: [...elements.foodSuggestions.childNodes],
    note: elements.searchNote.textContent,
    flags: foodPeerFlags.map(name => elements.foodSection.classList.contains(name)),
    suggestions: latestFoodSuggestions, limit: foodSuggestionVisibleCount,
    scroll: elements.foodSection.querySelector('.add-flow-content')?.scrollTop || 0,
  };
}
function applyFoodPeerSnapshot(snapshot) {
  elements.foodSuggestions.replaceChildren(...snapshot.nodes);
  elements.searchNote.textContent = snapshot.note;
  foodPeerFlags.forEach((name, index) => elements.foodSection.classList.toggle(name, snapshot.flags[index]));
  latestFoodSuggestions = snapshot.suggestions;
  foodSuggestionVisibleCount = snapshot.limit;
}
function prepareFoodPeer(nextIndex) {
  const nextFilter = elements.foodFilterTabs[nextIndex]?.dataset.foodFilter || 'all';
  const fromFilter = foodSearchFilter, previous = foodPeerSnapshot();
  const scope = JSON.stringify([elements.manualFoodName.value, foodLibrary, savedFoods, savedMeals, latestFoodSuggestions]);
  if (scope !== foodPeerScope) { foodPeerCache.clear(); foodPeerScope = scope; }
  foodPeerCache.set(fromFilter, previous);
  const pending = foodSearchPending;
  cancelFoodSearch();
  const resumeRequestId = foodSearchRequestId;
  const query = elements.manualFoodName.value;
  foodSearchFilter = nextFilter;
  elements.searchNote.closest('.food-filter-pane').dataset.peerFilter = nextFilter;
  let destination = foodPeerCache.get(nextFilter);
  if (destination) applyFoodPeerSnapshot(destination);
  else {
    if (!showBrowseFoodSuggestions()) {
      renderSuggestions(latestFoodSuggestions);
      if (foodSearchError) renderFoodSearchError(foodSearchError);
      if (pending) {
        elements.foodSection.classList.remove('has-search-fallback');
        if (!elements.foodSuggestions.querySelector('.suggestion-card')) {
          elements.foodSuggestions.innerHTML = '<p class="food-search-status" role="status">Searching food sources...</p>';
        }
        elements.searchNote.textContent = 'Searching food sources...';
      }
    }
    destination = { ...foodPeerSnapshot(), scroll: 0 };
  }
  // Rendering a preview is not selection. Keep the semantic state unchanged
  // while the finger is down; preserve exact original row nodes on cancellation.
  foodSearchFilter = fromFilter;
  latestFoodSuggestions = previous.suggestions;
  foodSuggestionVisibleCount = previous.limit;
  let committed = false;
  return {
    commit() {
      if (committed) return;
      committed = true;
      foodSearchFilter = nextFilter;
      latestFoodSuggestions = destination.suggestions;
      foodSuggestionVisibleCount = destination.limit;
      updateFoodFilterTabs();
    },
    rollback() {
      foodSearchFilter = fromFilter;
      applyFoodPeerSnapshot(previous);
      updateFoodFilterTabs();
    },
    settled(accepted) {
      const scroll = elements.foodSection.querySelector('.add-flow-content');
      if (scroll) scroll.scrollTop = accepted ? destination.scroll : previous.scroll;
      // Continue a genuinely pending query only after the pane transaction ends.
      if (pending && foodSearchRequestId === resumeRequestId && elements.manualFoodName.value === query) searchFoodSuggestions(query);
    },
  };
}
const foodPeerTabs = createPeerTabs({
  viewport: document.querySelector('#foodFilterViewport'),
  pane: document.querySelector('#foodFilterViewport > .food-filter-pane'),
  tabs: elements.foodFilterTabs,
  getIndex: () => Math.max(0, elements.foodFilterTabs.findIndex(tab => tab.dataset.foodFilter === foodSearchFilter)),
  prepare: prepareFoodPeer,
  win: window,
  enabled: () => elements.foodSection.classList.contains('add-flow-surface')
    && !elements.foodSection.matches('.is-detailing,.is-editing,.is-reviewing-scan,.is-describing-ai'),
  edgeOwns: point => {
    const surface = elements.foodSection.closest('.add-flow-host');
    return surface && (window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches)
      && point.clientX <= surface.getBoundingClientRect().left + 24;
  },
});
function selectFoodFilter(filter, options) {
  const index = elements.foodFilterTabs.findIndex(tab => tab.dataset.foodFilter === filter);
  foodPeerTabs?.select(Math.max(0, index), options);
}
// A new form/route action interrupts presentation before it can restore stale
// browse state. Tab taps own their interruption inside the controller.
elements.manualFoodForm.addEventListener('input', () => foodPeerTabs?.interrupt(), true);
elements.foodSection.addEventListener('click', event => {
  if (!event.target.closest('.food-filter-tabs,#foodFilterViewport')) foodPeerTabs?.interrupt();
}, true);
onDispose?.(() => foodPeerTabs?.dispose());
elements.foodScanButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  scanner.open();
});

elements.manualFoodShortcut?.addEventListener("click", () => {
  fillManualFood({ name: elements.manualFoodName.value.trim(), source: "Manual", serving: "1 serving", servingGrams: null, calories: 0, protein: 0, carbs: 0, fat: 0 }, { editableName: true });
  elements.foodEditName.textContent = "Manual food";
  elements.manualFoodName.focus();
});
elements.foodAiDescriptionTrigger?.addEventListener("click", openFoodAiDescription);
elements.foodAiDescriptionBack?.addEventListener("click", () => {
  closeFoodAiDescription();
  requestAnimationFrame(() => elements.foodAiDescriptionTrigger.focus());
});
elements.foodAiDescriptionInput?.addEventListener("input", () => {
  elements.foodAiDescriptionError.hidden = true;
  elements.foodAiDescriptionStatus.textContent = "";
  syncFoodAiDescriptionState();
});
elements.foodAiDescriptionInput?.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
  event.preventDefault();
  estimateDescribedFood();
});
elements.foodAiDescriptionSubmit?.addEventListener("click", estimateDescribedFood);
elements.foodAiDescriptionRetry?.addEventListener("click", estimateDescribedFood);
elements.foodAiDescriptionManual?.addEventListener("click", enterAiDescriptionManually);

function estimateExerciseCalories() {
  const preset = exercisePresets[elements.exerciseType.value] || exercisePresets.Running;
  const minutes = Number(elements.exerciseMinutes.value || preset.minutes);
  const weightKg = Number(state.user?.weightKg || 75);
  const calories = (preset.met * 3.5 * weightKg * minutes) / 200;
  const roundedCalories = Math.round(calories);
  elements.exerciseCaloriesEstimate.textContent = roundedCalories;
  elements.exerciseCaloriesNote.textContent = "Based on your profile";
  if (!exerciseCaloriesOverridden) elements.exerciseCalories.value = roundedCalories;
  updateExerciseManualEstimateNote(roundedCalories);
  return roundedCalories;
}

function setExerciseCaloriesEditing(isEditing) {
  const caloriesField = elements.exerciseCalories.closest(".exercise-calories-field");
  elements.exerciseEstimateCopy.hidden = isEditing;
  caloriesField.hidden = !isEditing;
  elements.exerciseManualEstimateNote.hidden = !isEditing;
  elements.exerciseEstimate.classList.toggle("is-manual-mode", isEditing);
  elements.exerciseSection.classList.toggle("is-calories-editing", isEditing);

  elements.exerciseCaloriesEdit.textContent = isEditing ? "Use estimate" : "Edit";
  elements.exerciseCaloriesEdit.setAttribute("aria-expanded", String(isEditing));
  elements.exerciseCaloriesEdit.setAttribute('aria-controls','exerciseCalories exerciseManualEstimateNote');
  updateExerciseManualEstimateNote(Number(elements.exerciseCaloriesEstimate.textContent || 0));
  if (isEditing) requestAnimationFrame(() => elements.exerciseCalories.focus());
}

function updateExerciseManualEstimateNote(estimate) {
  if (!elements.exerciseManualEstimateNote) return;
  elements.exerciseManualEstimateNote.textContent = editingExerciseId
    ? `Estimate: ${estimate} kcal`
    : exerciseCaloriesOverridden
    ? `Manual override · Estimate: ${estimate} kcal`
    : `Estimate: ${estimate} kcal`;
}

function applyExercisePreset() {
  const preset = exercisePresets[elements.exerciseType.value] || exercisePresets.Running;
  elements.exerciseMinutes.value = preset.minutes;
  estimateExerciseCalories();
}

function fillExerciseFormForEdit(exercise) {
  editingExerciseId = exercise.id;
  elements.exerciseType.value = exercise.name;
  elements.exerciseMinutes.value = exercise.minutes;
  elements.exerciseCalories.value = Math.round(Number(exercise.calories || 0));
  const savedCaloriesWereManual = exercise.caloriesManual !== false;
  // The shared rounded estimate is authoritative unless this entry explicitly
  // carries a manual override. In automatic mode it updates display and input.
  exerciseCaloriesOverridden = savedCaloriesWereManual;
  estimateExerciseCalories();
  elements.exerciseSubmit.textContent = "Save changes";
  elements.exerciseSection.classList.add("is-editing");
  openEditLogForm(elements.exerciseSection, elements.exerciseType);
  setExerciseCaloriesEditing(true);
  syncExerciseModeHeader();
  renderEntries();
  elements.exerciseType.focus();
}

function resetExerciseForm() {
  if (addSurface.deferReset(elements.exerciseSection, resetExerciseForm)) return;
  entryErrors(elements.exerciseForm, {}, false);entryStatus(elements.exerciseForm);
  elements.exerciseForm.reset();
  elements.exerciseSubmit.textContent = "Add exercise";
  editingExerciseId = null;
  exerciseCaloriesOverridden = false;
  elements.exerciseSection.classList.remove("is-editing");
  setExerciseCaloriesEditing(false);
  applyExercisePreset();
  clearEntryTransientState();
  syncExerciseModeHeader();
}

function normalizeExerciseCalories() {
  exerciseCaloriesOverridden = true;
  updateExerciseManualEstimateNote(Number(elements.exerciseCaloriesEstimate.textContent || 0));
}

elements.exerciseForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (entryCommits.has('exercise')) return;
  if (!entryErrors(elements.exerciseForm, validateExerciseEntry({ minutes: elements.exerciseMinutes.value, calories: elements.exerciseCalories.value }))) return;
  entryStatus(elements.exerciseForm);
  entryCommits.add('exercise'); elements.exerciseSubmit.disabled = true;
  try {
  const isEditing = Boolean(editingExerciseId);
  const exercise = {
    name: elements.exerciseType.value,
    minutes: decimalValue(elements.exerciseMinutes.value),
    weightKg: Number(state.user?.weightKg || 75),
    calories: Math.round(decimalValue(elements.exerciseCalories.value)),
    caloriesManual: exerciseCaloriesOverridden,
  };

  const day = { ...currentDay(), exercises: [...currentDay().exercises] };
  let addedId;
  if (editingExerciseId) {
    day.exercises = day.exercises.map((entry) =>
      entry.id === editingExerciseId ? { ...entry, ...exercise, updatedAt: new Date().toISOString() } : entry,
    );
  } else {
    addedId = localRecordId();
    day.exercises.unshift({
      ...exercise,
      id: addedId,
      createdAt: new Date().toISOString(),
    });
  }

  state = commitDiaryDay(localStorage, state, day);
  if (addedId) recentSuccess = { collection: 'exercises', id: addedId };
  render();
  addSurface.committed(entryTap);entryTap=null;
  closeEditLogForm(elements.exerciseSection);
  resetExerciseForm();
  if (!isEditing && !isPhoneAddFoodLayout()) playSubmitSuccess(elements.exerciseSubmit);
  } catch (error) {
    entryStatus(elements.exerciseForm, error?.code === 'local-id-unavailable' ? 'This browser could not create an entry. Update the browser and try again. Your draft is still here.' : 'Could not save this exercise on this device. Your draft is still here. Check storage and try again.');
  } finally { entryCommits.delete('exercise'); elements.exerciseSubmit.disabled = false; }
});

elements.exerciseType.addEventListener("change", () => {
  if (editingExerciseId) {
    estimateExerciseCalories();
    return;
  }
  applyExercisePreset();
});
elements.exerciseMinutes.addEventListener("input", estimateExerciseCalories);
elements.exerciseCalories.addEventListener("input", normalizeExerciseCalories);
elements.exerciseCaloriesEdit.addEventListener("click", () => {
  const isEditing = elements.exerciseSection.classList.contains("is-calories-editing");
  if (isEditing) {
    exerciseCaloriesOverridden = false;
    estimateExerciseCalories();
    if (editingExerciseId) {
      setExerciseCaloriesEditing(true);
      return;
    }
  }
  setExerciseCaloriesEditing(!isEditing);
  if (!isEditing) revealInline(elements.exerciseCaloriesEdit,elements.exerciseEstimate,
    {isCurrent:()=>elements.exerciseSection.classList.contains('is-calories-editing')});
});
elements.addExerciseToggle.addEventListener("click", () => {
  openAddExerciseFromFab();
});
elements.closeExerciseModal.addEventListener("click", () => {
  closeEditLogForm(elements.exerciseSection);
  resetExerciseForm();
});
elements.cancelExerciseEdit.addEventListener("click", () => {
  resetExerciseForm();
  renderEntries();
  elements.exerciseType.focus();
});
elements.deleteExerciseEdit.addEventListener("click", () => {
  if (!editingExerciseId) return;
  const entry = currentDay().exercises.find((exercise) => exercise.id === editingExerciseId);
  if (!entry) return;
  if (!window.confirm("Delete this exercise?")) return;
  closeEditLogForm(elements.exerciseSection);
  resetExerciseForm();
  deleteEntryWithUndo("exercises", entry);
});

function changeCalendarWeek(days, event = {}) {
  const trigger = event.currentTarget;
  state.selectedDate = localDateKey(addDays(dateFromKey(state.selectedDate), days));
  ensureDay(state.selectedDate);
  saveState();
  render();

  // A pointer tap should not leave a button looking permanently pressed.
  // Keep focus for keyboard activation, where it remains useful feedback.
  if (event.detail > 0) requestAnimationFrame(() => trigger?.blur());
}

const calendarViewport = elements.calendarStrip.closest('.calendar-week-viewport');
const calendarPreviews = Array.from(calendarViewport.querySelectorAll('[data-week-preview]'));
calendarSwipe = bindCalendarSwipe({
  viewport: calendarViewport, track: calendarViewport.querySelector('.calendar-week-track'), win: window,
  prepare: () => calendarPreviews.forEach(page => renderCalendarWeek(page,
    addDays(dateFromKey(state.selectedDate), Number(page.dataset.weekPreview) * 7), true)),
  clear: () => calendarPreviews.forEach(page => page.replaceChildren()),
  commit: (direction, event) => changeCalendarWeek(direction * 7, event),
});
onDispose(() => calendarSwipe.destroy());

elements.previousWeekButton.addEventListener("click", (event) => {
  calendarSwipe.arrow(-1, event);
});

elements.nextWeekButton.addEventListener("click", (event) => {
  calendarSwipe.arrow(1, event);
});

elements.floatingAddButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  openAddFoodFromFab();
});
elements.fabAddFood?.addEventListener("click", openAddFoodFromFab);
elements.fabScanFood?.addEventListener("click", openFoodScanFromFab);
elements.fabAddExercise?.addEventListener("click", openAddExerciseFromFab);
elements.fabSavedFoods?.addEventListener("click", openSavedFoodsFromFab);
elements.floatingScanButton?.addEventListener("click", openFoodScanFromFab);
elements.mobileFoodsTab?.addEventListener("click", (event) => {
  event.preventDefault();
  closeMobileLogForm(elements.foodSection);
  closeMobileLogForm(elements.exerciseSection);
  setFabMenuOpen(false);
  elements.foodSection.scrollIntoView({ behavior: window.IntakeMotion?.scrollBehavior() || "auto", block: "start" });
});
elements.fabSheetClose?.addEventListener("click", () => setFabMenuOpen(false));
elements.fabOverlay?.addEventListener("click", () => {
  setFabMenuOpen(false);
  if (!document.body.classList.contains("modal-open")) return;
  closeMobileLogForm(elements.foodSection);
  closeMobileLogForm(elements.exerciseSection);
  resetFoodForm();
  resetExerciseForm();
});
document.addEventListener("click", (event) => {
  if (!elements.fabActions?.classList.contains("is-open")) return;
  if (event.target.closest("#fabActions") || event.target.closest("#floatingAddButton") || event.target.closest("#fabOverlay")) return;
  setFabMenuOpen(false);
});

elements.todayButton.addEventListener("click", () => {
  const todayKey = localDateKey(new Date());
  state.selectedDate = todayKey;
  ensureDay(todayKey);
  saveState();
  render();
});


elements.sidebarToggle.addEventListener("click", () => {
  if (isMobileSidebar()) {
    setMobileSidebarOpen(false);
    return;
  }

  elements.appShell.classList.toggle("sidebar-collapsed");
  const isCollapsed = elements.appShell.classList.contains("sidebar-collapsed");
  localStorage.setItem("calorie-counter-sidebar-collapsed", String(isCollapsed));
});

elements.mobileMenuButton?.addEventListener("click", () => setMobileSidebarOpen(true));
elements.sidebarBackdrop?.addEventListener("click", () => setMobileSidebarOpen(false));
elements.appShell.querySelectorAll(".side-nav a").forEach((link) => {
  link.addEventListener("click", () => setMobileSidebarOpen(false));
});
window.addEventListener("focus", syncSelectedDateWithToday);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) syncSelectedDateWithToday();
});
setInterval(syncSelectedDateWithToday, 60 * 1000);

if (localStorage.getItem("calorie-counter-sidebar-collapsed") === "true") {
  elements.appShell.classList.add("sidebar-collapsed");
}
elements.foodMeal.value = defaultMealForNow();
updateFoodFilterTabs();
// The router recreates page content but retains this small per-route state.
// Read fresh local data and render it synchronously on every mount; only cold
// Today gets the initial ring fade. Do not reuse old totals or delayed callbacks.
elements.calorieRing.classList.toggle("is-route-return", Boolean(viewState.mounted));
render();
viewState.mounted = true;
requestAnimationFrame(openFoodsFromHash);
applyExercisePreset();
}
