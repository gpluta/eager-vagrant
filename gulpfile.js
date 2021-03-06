/**
 * Initialising the project: `gulp dist`
 * Watching: `gulp`
 * Clean dist dir: `gulp clean`
 * Switch dist dir from dev to prod: add `-p` or `--production` arg to any task
 */

let autoprefixer = require('gulp-autoprefixer'),
  batch = require('gulp-batch'),
  browserify = require('browserify'),
  browserSync = require('browser-sync'),
  buffer = require('vinyl-buffer'),
  changed = require('gulp-changed'),
  concat = require('gulp-concat'),
  cleanCss = require('gulp-clean-css'),
  del = require('del'),
  fs = require('fs'),
  gulp = require('gulp'),
  gutil = require('gulp-util'),
  imagemin = require('gulp-imagemin'),
  notify = require('gulp-notify'),
  plumber = require('gulp-plumber'),
  rename = require('gulp-rename'),
  runSequence = require('run-sequence'),
  sass = require('gulp-sass'),
  source = require('vinyl-source-stream'),
  sourcemaps = require('gulp-sourcemaps'),
  svgmin = require('gulp-svgmin'),
  svgstore = require('gulp-svgstore'),
  through = require('through2'),
  tsify = require('tsify'),
  tslint = require('gulp-tslint'),
  uglify = require('gulp-uglify'),
  watch = require('gulp-watch');

// Additional files to be included by scss
let scssInclude = [
  'node_modules/foundation-sites/scss',
  'node_modules/normalize.css'
];

let productionBuild = false; // Dev mode by default

function empty() { // Enables us to disable certain plugins in certain build modes
  return through.obj(function (file, enc, cb) {
    cb(null, file);
  });
}

// Switch to production mody by passing -p or --production as an additional argument to gulp
process.argv.forEach((e) => {
  if (['-p', '--production'].includes(e)) {
    // disable sourcemaps in production
    sourcemaps = {
      init() {
        return empty();
      }, write() {
        return empty();
      }
    };
    // Set build mode
    productionBuild = true;
  }
});

if (!productionBuild) {
  cleanCss = uglify = empty;
}

let distBase = productionBuild ? 'dist/' : 'working_dir/', srcBase = 'src/';

// Now let us configure some paths
let paths = {
  src: {
    base: srcBase,
    index: srcBase + 'public/index.php',
    app: [srcBase + 'app/**/*.*', srcBase + 'app/**/*'],
    images: srcBase + 'public/images/**/*.{jpg,png,gif,svg}',
    svg: srcBase + 'svg/**/*.svg',
    partials: srcBase + 'partials/', // Files inlined in index.php (for svg sprite mostly)
    scss: srcBase + 'public/scss/**/*.scss',
    ts: srcBase + 'public/ts/app.ts',
    allTs: srcBase + 'public/ts/**/*.ts',
    statics: [srcBase + 'statics/**/*.*', srcBase + 'statics/**/.*'], // Include dotfiles

    // This is a list of js files that will be concatenated and saved as vendor.js file. For stuff that can not be imported
    // into the project with `require()`
    vendorJs: [/*'node_modules/waypoints/lib/noframework.waypoints.min.js'*/]
  },
  dist: {
    base: distBase,
    index: distBase + 'public/',
    app: distBase + 'app/',
    images: distBase + 'public/images/',
    css: distBase + 'public/css/',
    js: distBase + 'public/js/',
    statics: distBase + 'public/'
  }
};

console.log('------------------------------------------------------');
console.log('productionBuild (true for production build): ', productionBuild);
console.log('------------------------------------------------------');

// Compile scss
gulp.task('scss', () => gulp.src(paths.src.scss)
  .pipe(plumber(function (error) {
    gutil.log(gutil.colors.red(error.message));
    this.emit('end');
  }))
  .pipe(sourcemaps.init())
  .pipe(sass({
    errLogToConsole: true,
    includePaths: scssInclude
  }))
  .pipe(autoprefixer({
    browsers: ['last 2 versions']
  }))
  .pipe(cleanCss())
  .pipe(sourcemaps.write())
  .pipe(gulp.dest(paths.dist.css))
);

gulp.task('tslint', () =>
  gulp.src(paths.src.allTs)
    .pipe(tslint({
      formatter: 'verbose'
    }))
    .pipe(tslint.report({emitError: false,summarizeFailureOutput: true})));

gulp.task('ts', () =>
  browserify({debug: (productionBuild === false)})
    .add(paths.src.ts)
    .plugin(tsify)
    .bundle()
    .on('error', function (error) {
      console.error(error.toString());
      this.emit('end');
    })
    .pipe(plumber())
    .pipe(source('scripts.js'))
    .pipe(buffer())
    .pipe(uglify())
    .pipe(gulp.dest(paths.dist.js))
);

// Concat and minify JS Includes
gulp.task('scripts-vendor', () => {
  if (paths.src.vendorJs.length) {
    return gulp.src(paths.src.vendorJs)
      .pipe(uglify())
      .pipe(concat('vendor.js'))
      .pipe(gulp.dest(paths.dist.js));
  }
});

// Minify and copy images
gulp.task('imagemin', () =>
  gulp.src(paths.src.images)
    .pipe(changed(paths.dist.images))
    .pipe(imagemin({
      progressive: true,
      svgoPlugins: [{
        removeViewBox: false
      }]
    }))
    .pipe(gulp.dest(paths.dist.images))
);

// Buld an svg sprite to be inlined in index.php later
gulp.task('svg-sprite', () =>
  gulp.src([paths.src.svg])
    .pipe(svgmin({
      floatPrecision: 2,
      plugins: [{
        removeDoctype: true
      }]
    }))
    .pipe(rename({prefix: 'image-'}))
    .pipe(svgstore({inlineSvg: true}))
    .pipe(rename({basename: 'svg-sprite', extname: '.svg'}))
    .pipe(gulp.dest(paths.dist.images))
);

// Inlcude inline stuff and copy index.php to dist folder
gulp.task('copy-index', () =>
  gulp.src(paths.src.index)
    .pipe(plumber())
    .pipe(gulp.dest(paths.dist.index))
);

// Copy all php files from app/ folder (libs)
gulp.task('copy-app', () =>
  gulp.src(paths.src.app)
    .pipe(gulp.dest(paths.dist.app))
);

// Remove everything from app/ in dist dir (reversed copy-app)
gulp.task('clean-app', () => {
  del(paths.dist.app + '/*');
});

// Copy all contents of statics/ folder to the root of public/ in dist folder (for stuff such
// as .htaccess or robots.txt)
gulp.task('copy-statics', () =>
  gulp.src(paths.src.statics)
    .pipe(plumber())
    .pipe(gulp.dest(paths.dist.statics))
);

// Browser-sync - proxy requests to our apache on vagrant
gulp.task('browser-sync', () => {
  browserSync.init({
    proxy: "localhost:8888",
    open: false,
    notify: false
  });
});

// Reload the browser
gulp.task('browser-reload', () => {
  browserSync.reload();
});

// Empty dist dir and remove the svg sprite
gulp.task('clean', () => {
  del([paths.dist.base + '/**/*.*']);
});

// PURGE EVERYTHING - leave only sources behind
gulp.task('purge', () => {
  del(['dist/', 'bower_components/', 'node_modules/', paths.dist.base + '/*']);
});

// Build the whole project by launching tasks synchronously
gulp.task('dist', cb => {
  runSequence(
    'clean', 'scss', 'tslint', 'ts', 'scripts-vendor', 'imagemin', 'svg-sprite', 'copy-index', 'copy-app', 'copy-statics', cb
  );
});

// Default task. Should be preceded by `gulp dist`. Watches for changes, launches tasks and reloads the browser. Nice!
gulp.task('default', ['browser-sync'], function () {
  watch(paths.src.index, batch((events, done) => {
    runSequence('copy-index', 'browser-reload', done);
  }));
  watch(paths.src.app, batch((events, done) => {
    runSequence('clean-app', 'copy-app', 'browser-reload', done);
  }));
  watch(paths.src.allTs, batch((events, done) => {
    runSequence('tslint', 'ts', 'browser-reload', done);
  }));
  watch(paths.src.scss, batch((events, done) => {
    runSequence('scss', 'browser-reload', done);
  }))
  watch(paths.src.images, batch((events, done) => {
    runSequence('imagemin', 'browser-reload', done);
  }));
  watch(paths.src.svg, batch((events, done) => {
    runSequence('svg-sprite', 'copy-index', 'browser-reload', done);
  }));
  watch(paths.src.statics, batch((events, done) => {
    runSequence('copy-statics', 'browser-reload', done);
  }));
});
