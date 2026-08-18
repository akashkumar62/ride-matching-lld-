package com.ridematching.logging.autoconfigure;

import com.ridematching.logging.config.LoggingProperties;
import com.ridematching.logging.filter.LoggingFilter;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.context.annotation.Bean;
import org.springframework.core.Ordered;

@AutoConfiguration
@EnableConfigurationProperties(LoggingProperties.class)
public class LoggingAutoConfiguration {

    @Bean
    public FilterRegistrationBean<LoggingFilter> loggingFilterRegistration(
            LoggingProperties properties
    ) {

        FilterRegistrationBean<LoggingFilter> registration =
                new FilterRegistrationBean<>();

        registration.setFilter(new LoggingFilter(properties));

        registration.addUrlPatterns("/*");

        registration.setOrder(Ordered.HIGHEST_PRECEDENCE);

        registration.setName("loggingFilter");

        return registration;
    }

}