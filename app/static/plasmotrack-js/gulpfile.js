var gulp = require('gulp'),
    path = require('path'),
    concat = require('gulp-concat'),
    uglify = require('gulp-uglify'),
    del = require('del'),
    Builder = require('systemjs-builder'),
    ts = require('gulp-typescript'),
    sourcemaps = require('gulp-sourcemaps');

var tsProject = ts.createProject('tsconfig.json');

var appDev = 'app';
var appProd = 'build/app';

gulp.task('ts', () => {
    return gulp.src(appDev + '/**/*.ts')
        .pipe(sourcemaps.init({
            loadMaps: true
        }))
        .pipe(ts(tsProject))
        .pipe(sourcemaps.write('.'))
        .pipe(gulp.dest(appProd));
});

gulp.task('bundle', function() {
    var builder = new Builder('', 'systemjs.config.js');

    return builder
        .buildStatic(appProd + '/main.js', './bundle.js', { minify: true, sourceMaps: true})
        .then(function() {
            console.log('Build Complete');
        })
        .catch(function(err) {
            console.log('Build error');
            console.log(err);
        });
});

gulp.task('bundle:vendor', function() {
    return gulp.src([
        'node_modules/es6-shim/es6-shim.min.js',
        'node_modules/zone.js/dist/zone.js',
        'node_modules/reflect-metadata/Reflect.js',
        'node_modules/systemjs/dist/system.src.js',
        'custom/d3.js',
        'node_modules/jquery/dist/jquery.min.js',
        'node_modules/bootstrap/dist/js/bootstrap.min.js',
        'node_modules/socket.io-client/socket.io.js',
        'node_modules/toastr/build/toastr.min.js',
        'systemjs.config.js'
    ])
    .pipe(concat('./vendor.min.js'))
    .pipe(uglify())
    .pipe(gulp.dest('.'))
})

gulp.task('clean_build', function() {
    return del([
        appProd + '/**/*'
    ])
})

gulp.task('build', gulp.series(['ts', 'bundle', 'clean_build']));