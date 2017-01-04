var gulp = require('gulp'),
    path = require('path'),
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

gulp.task('build', gulp.series(['ts', 'bundle']));